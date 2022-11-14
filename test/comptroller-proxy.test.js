/* eslint-disable @typescript-eslint/no-var-requires */
const { utils } = require('ethers');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { deployments } = require('./utils/deploy-test-contracts.js');
const {
  emptyConfigData,
  getFundAddresses,
  advanceTime,
  filterEventsByABI,
  transferABI,
  comptrollerProxyDeployedEventABI,
  paraSwapV5CallArgsEncodeType,
} = require('./utils/fndz-utilities.js');

/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let comptrollerProxy;
let vaultProxy;
let denominationAsset;
let incomingAsset;
let mockUSDC;
let depositAmount;

let fndzController;
let fundActionsWrapper;
let comptroller;
let vault;
let fundDeployer;
let mockedParaSwapV5AdapterApprove;

const timeLockSpan = 24 * 60 * 60;
const crystallizationPeriod = 30 * 24 * 60 * 60;

beforeEach(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];

  const FundDeployer = await ethers.getContractFactory('FundDeployer', deployer.address);
  fundDeployer = FundDeployer.attach(contracts.FundDeployer);

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contracts.FNDZController);
  expect(fndzController).to.be.an('object');

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  denominationAsset = MockToken.attach(contracts.mockTokens.MockBUSD);
  incomingAsset = MockToken.attach(contracts.mockTokens.MockDai);
  mockUSDC = MockToken.attach(contracts.mockTokens.MockUSDC);

  const performanceFeePercentage = utils.parseEther('0.1');
  const abiCoder = new ethers.utils.AbiCoder();
  const encodedPerformanceFeeParams = abiCoder.encode(
    ['uint', 'uint'],
    [performanceFeePercentage, crystallizationPeriod],
  );
  const fndzInvestmentFeePercentage = utils.parseEther('0.01');
  const encodedFndzInvestmentFeeParams = abiCoder.encode(['uint'], [fndzInvestmentFeePercentage]);
  const encodedFeeData = abiCoder.encode(
    ['address[]', 'bytes[]'],
    [
      [contracts.PerformanceFee, contracts.FNDZInvestmentFee],
      [encodedPerformanceFeeParams, encodedFndzInvestmentFeeParams],
    ],
  );

  /// Creating a Vault
  const tx = await fndzController.createNewFund(
    deployer.address,
    'Test Vault',
    denominationAsset.address,
    timeLockSpan,
    encodedFeeData,
    emptyConfigData,
  );
  const receipt = await tx.wait();
  expect(receipt.status).to.equal(1);

  ({ comptrollerProxy, vaultProxy } = getFundAddresses(receipt));

  const Comptroller = await ethers.getContractFactory('ComptrollerLib', deployer);
  comptroller = Comptroller.attach(comptrollerProxy);

  const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
  vault = VaultLib.attach(vaultProxy);

  // Buying some shares on the Fund
  depositAmount = utils.parseEther('100');
  await denominationAsset.approve(comptroller.address, depositAmount.mul(2));
  await comptroller.buyShares(depositAmount, 0, ethers.constants.AddressZero);

  const IntegrationManager = await ethers.getContractFactory('IntegrationManager', deployer);
  const integrationManager = IntegrationManager.attach(contracts.IntegrationManager);
  expect(integrationManager).to.be.an('object');

  const FundActionsWrapper = await ethers.getContractFactory('FundActionsWrapper', deployer);
  fundActionsWrapper = FundActionsWrapper.attach(contracts.FundActionsWrapper);

  // Mocked PARASWAP Adapter for approve calling
  const MockParaSwapV5AdapterApprove = await ethers.getContractFactory('MockParaSwapV5AdapterApprove', deployer);
  mockedParaSwapV5AdapterApprove = await MockParaSwapV5AdapterApprove.deploy(
    contracts.IntegrationManager,
    contracts.MockParaSwapV5AugustusSwapper,
    accounts[5].address,
    [],
  );
  await mockedParaSwapV5AdapterApprove.deployed();

  // Registering Mocked Adapter
  await integrationManager.registerAdapters([mockedParaSwapV5AdapterApprove.address]);
});

describe('Comptroller Proxy Test Suite', async function () {
  it("functions with onlyFundDeployer modifier can't be call by vault Owner", async function () {
    const onlyFundDeployerRevertMessage = 'Only FundDeployer callable';

    await expect(comptroller.configureExtensions(emptyConfigData, emptyConfigData)).to.be.revertedWith(
      onlyFundDeployerRevertMessage,
    );
    await expect(comptroller.activate(vaultProxy, true)).to.be.revertedWith(onlyFundDeployerRevertMessage);
    await expect(comptroller.destruct()).to.be.revertedWith(onlyFundDeployerRevertMessage);
  });

  it("functions with onlyOwner modifier can't be called by random user", async function () {
    const onlyOwnerRevertMessage = 'Only fund owner callable';

    const randomUser = accounts[2];
    await expect(comptroller.connect(randomUser).setOverridePause(true)).to.be.revertedWith(onlyOwnerRevertMessage);
    await expect(
      comptroller.connect(randomUser).vaultCallOnContract(ethers.constants.AddressZero, '0x00000000', '0x00'),
    ).to.be.revertedWith(onlyOwnerRevertMessage);
  });

  it("Functions with onlyNotPaused modifier can't be called while paused", async function () {
    const onlyNotPausedRevertMessage = 'Fund is paused';
    // Set Release status to paused
    await fundDeployer.setReleaseStatus(2);

    await expect(comptroller.callOnExtension(ethers.constants.AddressZero, 0, '0x00')).to.be.revertedWith(
      onlyNotPausedRevertMessage,
    );
    await expect(
      comptroller.vaultCallOnContract(ethers.constants.AddressZero, '0x00000000', '0x00'),
    ).to.be.revertedWith(onlyNotPausedRevertMessage);
    await expect(comptroller.permissionedVaultAction(0, '0x00')).to.be.revertedWith(onlyNotPausedRevertMessage);
    await expect(comptroller.buyShares(0, 0, ethers.constants.AddressZero)).to.be.revertedWith(
      onlyNotPausedRevertMessage,
    );
  });

  it('Can still withdraw from vaults when paused', async function () {
    await fundDeployer.setReleaseStatus(2);
    // Advancing the time to complete the time lock span
    await advanceTime(timeLockSpan);
    await expect(comptroller.redeemSharesDetailed(0, [], [])).to.be.not.reverted;
  });

  it('Should not able to call buyShares again while the timelock span', async function () {
    // Trying to deposit again before time lock span ends
    await expect(comptroller.buyShares(depositAmount, 0, ethers.constants.AddressZero)).to.revertedWith(
      'Shares action timelocked',
    );

    // Advancing the time to complete the time lock span
    await advanceTime(timeLockSpan);

    // Trying to deposit again after the time lock span
    await expect(comptroller.buyShares(depositAmount, 0, ethers.constants.AddressZero)).to.be.not.reverted;
  });

  it('Should not be able to redeem shares while within the timelock span', async function () {
    // Trying to redeem shares before time lock span ends
    await expect(comptroller.redeemSharesDetailed(0, [], [])).to.revertedWith('Shares action timelocked');

    // Advancing the time to complete the time lock span
    await advanceTime(timeLockSpan);

    // Trying to redeem shares again after time lock span
    await expect(comptroller.redeemSharesDetailed(0, [], [])).to.be.not.reverted;
  });

  it('Should be able to redeem shares even in timelock span, but not be able to buy shares, when have the pending migration request', async function () {
    /// Migrating Fund Setup ///
    const Dispatcher = await ethers.getContractFactory('Dispatcher', deployer.address);
    const dispatcher = Dispatcher.attach(contracts.Dispatcher);

    const FundDeployer = await hre.ethers.getContractFactory('FundDeployer', deployer);
    const newFundDeployer = await FundDeployer.deploy(dispatcher.address, fndzController.address, [], []);
    await newFundDeployer.deployed();

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer.address);
    const comptrollerLib = await ComptrollerLib.deploy(
      dispatcher.address,
      newFundDeployer.address,
      contracts.ValueInterpreter,
      contracts.FeeManager,
      contracts.IntegrationManager,
      contracts.PolicyManager,
      contracts.ChainlinkPriceFeed,
    );

    await newFundDeployer.setComptrollerLib(comptrollerLib.address);
    await newFundDeployer.setReleaseStatus(1); // set new fund deployer release status to live

    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);

    // Initiate the Migration
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      timeLockSpan,
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;

    await newFundDeployer.signalMigration(vaultProxy, comptrollerDeployedEvent.comptrollerProxy);
    /// Migrating Fund Requested ///

    // Trying to redeem shares within the time lock span
    await comptroller.redeemSharesDetailed(0, [], []);

    await denominationAsset.approve(comptrollerProxy, utils.parseEther('1000'));
    const depositAmount = utils.parseEther('100');
    await expect(comptroller.buyShares(depositAmount, 0, ethers.constants.AddressZero)).to.be.revertedWith(
      'buyShares: Pending migration',
    );
  });

  it('Verify all CallOnExtension Actions', async function () {
    // Integration Manager //

    // Action 0 - Call On Integration (Paraswap - Trade)
    const abiCoder = new utils.AbiCoder();
    const takeOrderABI = 'function takeOrder(address _vaultProxy,bytes calldata _encodedCallArgs,bytes calldata)';
    const takeOrderInterface = new utils.Interface([takeOrderABI]);
    const samplePath = [
      [
        incomingAsset.address,
        '0',
        [
          [
            '0x0000000000000000000000000000000000000000',
            100,
            0,
            [
              [
                0,
                '0x0000000000000000000000000000000000000000',
                10000,
                '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
                0,
              ],
            ],
          ],
        ],
      ],
    ];
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      utils.parseEther('20'),
      utils.parseEther('20'),
      denominationAsset.address,
      utils.parseEther('10'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePath,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptroller.callOnExtension(contracts.IntegrationManager, 0, encodedTradeData);
    expect(await incomingAsset.balanceOf(vaultProxy)).to.equal(utils.parseEther('20'));

    const encodedAssets = abiCoder.encode(['address[]'], [[mockUSDC.address]]);

    // Action 1 - Add Any-Balance Tracked Asset
    await comptroller.callOnExtension(contracts.IntegrationManager, 1, encodedAssets);
    expect(await vault.getTrackedAssets()).to.be.contains(mockUSDC.address);

    // Action 2 - Remove Zero Balance Tracked Asset
    await comptroller.callOnExtension(contracts.IntegrationManager, 2, encodedAssets);
    expect(await vault.getTrackedAssets()).to.be.not.contains(mockUSDC.address);

    // Action ID other then 0, 1, or 2 should be reverted
    await expect(comptroller.callOnExtension(contracts.IntegrationManager, 3, encodedAssets)).to.revertedWith(
      'receiveCallFromComptroller: Invalid _actionId',
    );

    // Fee Manager //

    // Action 0 - Continuous Fee Hook
    const continuousHookTx = await comptroller.callOnExtension(contracts.FeeManager, 0, '0x00');
    const continuousHookReceipt = await continuousHookTx.wait();
    const transferEvents = filterEventsByABI(continuousHookReceipt, [transferABI]);
    expect(transferEvents.length).to.equal(1);
    expect((await vault.balanceOf(vaultProxy)).gt(0)).to.be.true;

    // Action 1 - Payout Shares Outstanding
    // Advancing the time to complete crystallization period
    await advanceTime(crystallizationPeriod);
    const encodedFees = abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]);
    await comptroller.callOnExtension(contracts.FeeManager, 1, encodedFees);
    expect(await vault.balanceOf(vaultProxy)).to.equal(0);

    // Action 2 - PostContinuous Fee Hook
    const LockedAmountUpdatedEventABI =
      'event LockedBalanceUpdated(address comptrollerProxy, uint256 oldBalance, uint256 newBalance)';
    const postContinuousHookTx = await comptroller.callOnExtension(contracts.FeeManager, 2, '0x');
    const postContinuousHookReceipt = await postContinuousHookTx.wait();
    const lockedAmountUpdatedEvents = filterEventsByABI(postContinuousHookReceipt, [LockedAmountUpdatedEventABI]);
    expect(lockedAmountUpdatedEvents.length).to.equal(1);

    // Action ID other then 0, 1 or 2 should be reverted
    await expect(comptroller.callOnExtension(contracts.FeeManager, 3, encodedAssets)).to.revertedWith(
      'receiveCallFromComptroller: Invalid _actionId',
    );
  });

  it('can not directly call the permissionedVaultAction()', async function () {
    await expect(comptroller.permissionedVaultAction(1, '0x00')).to.be.revertedWith(
      '__assertPermissionedVaultAction: No action allowed',
    );
  });

  it('Random users can call Gross value related methods', async function () {
    const randomUser = accounts[5];
    await expect(comptroller.connect(randomUser).calcGav()).to.be.not.reverted;
    await expect(comptroller.connect(randomUser).calcGrossShareValue()).to.be.not.reverted;
  });

  it('Able to get Lib Routes', async function () {
    const libRoutes = await comptroller.getLibRoutes();
    expect(libRoutes[0]).be.equal(contracts.Dispatcher);
    expect(libRoutes[1]).be.equal(contracts.FeeManager);
    expect(libRoutes[2]).be.equal(contracts.FundDeployer);
    expect(libRoutes[3]).be.equal(contracts.IntegrationManager);
    expect(libRoutes[4]).be.equal(contracts.PolicyManager);
    expect(libRoutes[5]).be.equal(contracts.ChainlinkPriceFeed);
    expect(libRoutes[6]).be.equal(contracts.ValueInterpreter);
  });

  it('Override pause can be get and set by the owner', async function () {
    const txn = await expect(comptroller.setOverridePause(true)).to.be.not.reverted;
    const receipt = await txn.wait();
    expect(receipt.events[0].event).to.be.equals('OverridePauseSet');
    expect(await comptroller.getOverridePause()).to.be.true;
  });

  it('Able to get the shares action time lock', async function () {
    expect(await comptroller.getSharesActionTimelock()).to.be.equal(timeLockSpan);
  });

  it('Able to get the vault proxy using comptroller', async function () {
    expect(await comptroller.getVaultProxy()).to.be.equal(vaultProxy);
  });

  it('can not callOnExtension for an address other than fee manager or integration manager', async function () {
    const abiCoder = new utils.AbiCoder();
    const encodedAssets = abiCoder.encode(['address[]'], [[mockUSDC.address]]);
    await expect(comptroller.callOnExtension(contracts.PolicyManager, 1, encodedAssets)).to.be.revertedWith(
      'callOnExtension: _extension invalid',
    );
  });

  it('can not add the unapproved asset to the tracked assets', async function () {
    const abiCoder = new utils.AbiCoder();
    await expect(
      comptroller.callOnExtension(
        contracts.IntegrationManager,
        1,
        abiCoder.encode(['address[]'], [[contracts.mockTokens.MockWBTC]]),
      ),
    ).to.be.revertedWith('__addTrackedAssets: Unsupported asset');
  });

  it('can calculate netShareValue using FundActionsWrapper', async function () {
    // Anyone can call
    await expect(fundActionsWrapper.connect(accounts[3]).calcNetShareValueForFund(comptroller.address)).to.be.not
      .reverted;

    // Can get the fee Manager
    expect(await fundActionsWrapper.getFeeManager()).to.equal(contracts.FeeManager);
  });

  it('can get continuous fees using FundActionsWrapper', async function () {
    // Anyone can call
    let fees = await fundActionsWrapper.connect(accounts[3]).getContinuousFeesForFund(comptroller.address);
    expect(fees.length).to.equal(1);
    expect(fees).to.contains(contracts.PerformanceFee);

    // Creating a No Fee Vault
    const tx = await fndzController.createNewFund(
      deployer.address,
      'No Fee Vault',
      denominationAsset.address,
      timeLockSpan,
      emptyConfigData,
      emptyConfigData,
    );
    const receipt = await tx.wait();
    expect(receipt.status).to.equal(1);

    ({ comptrollerProxy } = getFundAddresses(receipt));

    fees = await fundActionsWrapper.getContinuousFeesForFund(comptrollerProxy);
    expect(fees.length).to.equal(0);
  });

  it('should able to call approveAssetSpender', async function () {
    const abiCoder = new utils.AbiCoder();
    const takeOrderABI = 'function takeOrder(address _vaultProxy,bytes calldata _encodedCallArgs,bytes calldata)';
    const takeOrderInterface = new utils.Interface([takeOrderABI]);
    const samplePath = [
      [
        incomingAsset.address,
        '0',
        [
          [
            '0x0000000000000000000000000000000000000000',
            100,
            0,
            [
              [
                0,
                '0x0000000000000000000000000000000000000000',
                10000,
                '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
                0,
              ],
            ],
          ],
        ],
      ],
    ];
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      utils.parseEther('20'),
      utils.parseEther('20'),
      denominationAsset.address,
      utils.parseEther('10'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePath,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [mockedParaSwapV5AdapterApprove.address, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    const response = await comptroller.callOnExtension(contracts.IntegrationManager, 0, encodedTradeData);
    const tradeTx = await ethers.provider.getTransactionReceipt(response.hash);
    expect(tradeTx.status).to.equal(1);
  });
});

describe('ComptrollerLib VaultCallOnContract Tests', function () {
  let mockVaultCall;
  let selectors;
  let abiCoder;
  let encodedCallArgs;
  const valueReceivedEventABI = 'event ValueReceived(uint256 value)';
  beforeEach(async function () {
    const MockVaultCall = await ethers.getContractFactory('MockVaultCall', deployer);
    mockVaultCall = await MockVaultCall.deploy();
    await mockVaultCall.deployed();
    abiCoder = new utils.AbiCoder();

    const receiveValueMethodABI = 'function receiveValue(uint256 _value)';
    const invalidMethodABI = 'function invalidMethod(uint256 _value)';
    selectors = new utils.Interface([receiveValueMethodABI, invalidMethodABI]);

    encodedCallArgs = abiCoder.encode(['uint256'], [utils.parseEther('1')]);
  });
  it('Should be able to call on vault', async function () {
    // Registering Calls
    await fundDeployer.registerVaultCalls([mockVaultCall.address], [selectors.getSighash('receiveValue')]);

    const callTx = await comptroller.vaultCallOnContract(
      mockVaultCall.address,
      selectors.getSighash('receiveValue'),
      encodedCallArgs,
    );
    const callReceipt = await callTx.wait();
    const valueReceivedEvents = filterEventsByABI(callReceipt, [valueReceivedEventABI]);
    expect(valueReceivedEvents.length).to.equal(1);
    const valueReceivedEvent = valueReceivedEvents[0].args;
    expect(valueReceivedEvent.value).to.equal(utils.parseEther('1'));
  });
  it('Should not be able to call unregistered calls', async function () {
    await expect(
      comptroller.vaultCallOnContract(mockVaultCall.address, selectors.getSighash('invalidMethod'), encodedCallArgs),
    ).to.revertedWith('vaultCallOnContract: Unregistered');
  });
  it('Only owner can call', async function () {
    await expect(
      comptroller
        .connect(accounts[1])
        .vaultCallOnContract(mockVaultCall.address, selectors.getSighash('receiveValue'), encodedCallArgs),
    ).to.revertedWith('Only fund owner callable');
  });
  it('Can not call when release status is paused', async function () {
    // Set Release status to paused
    await fundDeployer.setReleaseStatus(2);

    await expect(
      comptroller.vaultCallOnContract(mockVaultCall.address, selectors.getSighash('receiveValue'), encodedCallArgs),
    ).to.revertedWith('Fund is paused');
  });
  it('Should fail on invalid method calls', async function () {
    // Registering Calls
    await fundDeployer.registerVaultCalls([mockVaultCall.address], [selectors.getSighash('invalidMethod')]);

    await expect(
      comptroller.vaultCallOnContract(mockVaultCall.address, selectors.getSighash('invalidMethod'), encodedCallArgs),
    ).to.be.reverted;
  });
});
