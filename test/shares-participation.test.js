/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers } = require('hardhat');
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { deployments } = require('./utils/deploy-test-contracts.js');
const {
  emptyConfigData,
  getFundAddresses,
  extractEventArgs,
  filterEventsByABI,
  sharesRedeemedABI,
  takeOrderABI,
  advanceTime,
  comptrollerProxyDeployedEventABI,
  paraSwapV5CallArgsEncodeType,
} = require('./utils/fndz-utilities.js');
const { convertRateToScaledPerSecondRate } = require('./utils/management-fee.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let accounts;
let deployer;
let abiCoder;
let mockBUSDToken;
let mockUSDC;
let mockDAI;
let comptroller;
let vault;
let comptrollerProxy;
let vaultProxy;
let contractAddresses;
let integrationManager;
let mockReentrancyToken;
let fndzController;
let chainlinkPriceFeed;

beforeEach(async function () {
  // runs before each test in this block

  contractAddresses = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  abiCoder = new utils.AbiCoder();
  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contractAddresses.FNDZController);

  const IntegrationManager = await ethers.getContractFactory('IntegrationManager', deployer);
  integrationManager = IntegrationManager.attach(contractAddresses.IntegrationManager);

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  mockBUSDToken = MockToken.attach(contractAddresses.mockTokens.MockBUSD);
  mockUSDC = MockToken.attach(contractAddresses.mockTokens.MockUSDC);
  mockDAI = MockToken.attach(contractAddresses.mockTokens.MockDai);

  const tx = await fndzController.createNewFund(
    deployer.address,
    'Test Fund',
    contractAddresses.mockTokens.MockBUSD,
    '1',
    emptyConfigData,
    emptyConfigData,
  );
  const receipt = await tx.wait();
  ({ comptrollerProxy, vaultProxy } = getFundAddresses(receipt));

  const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
  comptroller = ComptrollerLib.attach(comptrollerProxy);

  const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
  vault = VaultLib.attach(vaultProxy);
  await mockBUSDToken.mintFor(accounts[1].address, BigNumber.from('10000000000000000000000'));

  const MockReentrancyToken = await ethers.getContractFactory('MockReentrancyToken', deployer);
  mockReentrancyToken = await MockReentrancyToken.deploy();
  await mockReentrancyToken.deployed();

  const ChainlinkPriceFeed = await ethers.getContractFactory('ChainlinkPriceFeed', deployer);
  chainlinkPriceFeed = ChainlinkPriceFeed.attach(contractAddresses.ChainlinkPriceFeed);
});

describe('ComptrollerLib  buyShares Tests', function () {
  it('Should place order of buyShares', async function () {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    const depositAmount = '100';
    const buyShareResult = await comptroller
      .connect(accounts[1])
      .buyShares(depositAmount, 0, ethers.constants.AddressZero);
    const sharesReceipt = await buyShareResult.wait();
    const { caller, buyer, investmentAmount, sharesReceived } = extractEventArgs(sharesReceipt, 'SharesBought');
    expect(accounts[1].address).to.equal(caller);
    expect(accounts[1].address).to.equal(buyer);
    expect(depositAmount).to.equal(investmentAmount);
    expect((await vault.balanceOf(buyer)).toString()).to.equal(sharesReceived.toString());
  });
  it('Should revert if investment amount is 0', async function () {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    const depositAmount = '0';
    await expect(
      comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero),
    ).to.be.revertedWith(' Empty _investmentAmount');
  });

  it('Should revert with Shares received < _minSharesQuantity', async function () {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '100');
    const depositAmount = '10';
    await expect(
      comptroller.connect(accounts[1]).buyShares(depositAmount, '15', ethers.constants.AddressZero),
    ).to.be.revertedWith(' Shares received < _minSharesQuantity');
  });
});

describe('ComptrollerLib  redeemSharesDetailed Tests', function () {
  it('Should Redeem Shares', async function () {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    const depositAmount = '100';
    const buyShareResult = await comptroller
      .connect(accounts[1])
      .buyShares(depositAmount, 0, ethers.constants.AddressZero);
    const sharesReceipt = await buyShareResult.wait();
    const { sharesReceived } = extractEventArgs(sharesReceipt, 'SharesBought');

    const beforeRedeemBalance = ethers.BigNumber.from(await vault.balanceOf(accounts[1].address));

    const redeemShares = await comptroller.connect(accounts[1]).redeemSharesDetailed(sharesReceived.toString(), [], []);
    const redeemSharesReceipt = await redeemShares.wait();
    const { sharesQuantity } = extractEventArgs(redeemSharesReceipt, 'SharesRedeemed');
    const finalBalance = beforeRedeemBalance.sub(sharesQuantity);
    expect(finalBalance).to.equal(await vault.balanceOf(accounts[1].address));
  });

  it('does not allow a _sharesQuantity greater than the redeemer balance', async () => {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    const depositAmount = '100';
    const buyShareResult = await comptroller
      .connect(accounts[1])
      .buyShares(depositAmount, 0, ethers.constants.AddressZero);
    await buyShareResult.wait();

    await expect(comptroller.connect(accounts[1]).redeemSharesDetailed('101', [], [])).to.be.revertedWith(
      ' Insufficient shares',
    );
  });

  it('does not allow duplicate _assetsToSkip', async () => {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    const depositAmount = '100';
    const buyShareResult = await comptroller
      .connect(accounts[1])
      .buyShares(depositAmount, 0, ethers.constants.AddressZero);
    await buyShareResult.wait();

    await expect(
      comptroller
        .connect(accounts[1])
        .redeemSharesDetailed('100', [], [contractAddresses.mockTokens.MockDai, contractAddresses.mockTokens.MockDai]),
    ).to.be.revertedWith('_assetsToSkip contains duplicates');
  });

  it('does not allow duplicate _additionalAssets', async () => {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    const depositAmount = '100';
    const buyShareResult = await comptroller
      .connect(accounts[1])
      .buyShares(depositAmount, 0, ethers.constants.AddressZero);
    await buyShareResult.wait();

    await expect(
      comptroller
        .connect(accounts[1])
        .redeemSharesDetailed('100', [contractAddresses.mockTokens.MockDai, contractAddresses.mockTokens.MockDai], []),
    ).to.be.revertedWith(' _additionalAssets contains duplicates');
  });

  it('does not allow share redemption when there are no payout assets', async () => {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    const depositAmount = '100';
    const buyShareResult = await comptroller
      .connect(accounts[1])
      .buyShares(depositAmount, 0, ethers.constants.AddressZero);
    await buyShareResult.wait();

    await expect(
      comptroller.connect(accounts[1]).redeemSharesDetailed('100', [], [mockBUSDToken.address]),
    ).to.be.revertedWith(' No payout assets');
  });

  it('Should use additionalAssets to received untracked assets on the vault', async function () {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    // Before deposit balance check
    const depositAmount = '100';
    const buyShareResult = await comptroller
      .connect(accounts[1])
      .buyShares(depositAmount, 0, ethers.constants.AddressZero);
    await buyShareResult.wait();

    const MockUSDCToken = await ethers.getContractFactory('MockToken', deployer);
    const mockUSDCToken = MockUSDCToken.attach(contractAddresses.mockTokens.MockUSDC);

    await mockUSDCToken.mintFor(vault.address, BigNumber.from('10000000000000000000000'));

    expect(await vault.getTrackedAssets()).to.be.contains(mockBUSDToken.address);
    expect(await vault.getTrackedAssets()).to.be.not.contains(mockUSDCToken.address);

    const sharesToRedeem = BigNumber.from('10');
    const redeemShares = await comptroller
      .connect(accounts[1])
      .redeemSharesDetailed(sharesToRedeem, [mockUSDCToken.address], []);
    const redeemSharesReceipt = await redeemShares.wait();
    const assetWithdrawnEvents = filterEventsByABI(redeemSharesReceipt, [
      'event AssetWithdrawn(address indexed asset, address indexed target, uint256 amount)',
    ]);
    expect(assetWithdrawnEvents.length).to.equal(2);

    let { asset, target, amount } = assetWithdrawnEvents[0].args;
    expect(mockBUSDToken.address).to.equal(asset);
    expect(accounts[1].address).to.equal(target);
    const vaultBUSD = await mockBUSDToken.balanceOf(vault.address);
    const sharesTotalSupply = await vault.totalSupply();
    expect(amount).to.equal(sharesToRedeem.mul(vaultBUSD).div(sharesTotalSupply));
    expect(await vault.getTrackedAssets()).to.be.contains(mockBUSDToken.address);

    ({ asset, target, amount } = assetWithdrawnEvents[1].args);
    expect(mockUSDCToken.address).to.equal(asset);
    expect(accounts[1].address).to.equal(target);
    const vaultUSDC = await mockUSDCToken.balanceOf(vault.address);
    expect(amount).to.equal(sharesToRedeem.mul(vaultUSDC).div(sharesTotalSupply));
    expect(await vault.getTrackedAssets()).to.be.not.contains(mockUSDCToken.address);
  });

  it('Should be able to forfeit assets when calling redeemSharesDetailed by using assetsToSkip', async function () {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    const depositAmount = '100';
    const buyShareResult = await comptroller
      .connect(accounts[1])
      .buyShares(depositAmount, 0, ethers.constants.AddressZero);
    await buyShareResult.wait();
    const daiBalance = BigNumber.from('10000000000000000000000');
    //add tracked asset to vault
    const MockDAIToken = await ethers.getContractFactory('MockToken', deployer);
    const mockDAIToken = MockDAIToken.attach(contractAddresses.mockTokens.MockDai);
    await mockDAIToken.mintFor(vault.address, daiBalance);
    const args = [mockDAIToken.address];
    var encodedAddresses = ethers.utils.defaultAbiCoder.encode(['address[]'], [args]);
    var trackedAssetResultTx = await comptroller.callOnExtension(
      integrationManager.address,
      ethers.BigNumber.from('1'),
      encodedAddresses,
    );
    const receipt = await trackedAssetResultTx.wait();
    expect(receipt.status).to.equal(1);

    expect(await vault.getTrackedAssets()).to.be.contains(mockDAIToken.address);
    expect(await vault.getTrackedAssets()).to.be.contains(mockBUSDToken.address);

    expect(await mockDAIToken.balanceOf(vault.address)).to.equal(daiBalance);
    const investmentAmount = '10';
    const redeemShares = await comptroller
      .connect(accounts[1])
      .redeemSharesDetailed(investmentAmount, [], [mockDAIToken.address]);
    const redeemSharesReceipt = await redeemShares.wait();

    const assetWithdrawnEvents = filterEventsByABI(redeemSharesReceipt, [
      'event AssetWithdrawn(address indexed asset, address indexed target, uint256 amount)',
    ]);
    expect(assetWithdrawnEvents.length).to.equal(1);
    expect(await mockDAIToken.balanceOf(vault.address)).to.equal(daiBalance);
    expect(await vault.getTrackedAssets()).to.be.contains(mockDAIToken.address);
    expect(await vault.getTrackedAssets()).to.be.contains(mockBUSDToken.address);
  });

  it('Should remove non-denominational tracked assets when the vault balance drops to 0 during share redemption', async function () {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    const depositAmount = '100';
    const buyShareResult = await comptroller
      .connect(accounts[1])
      .buyShares(depositAmount, 0, ethers.constants.AddressZero);
    await buyShareResult.wait();

    const MockUSDCToken = await ethers.getContractFactory('MockToken', deployer);
    const mockUSDCToken = MockUSDCToken.attach(contractAddresses.mockTokens.MockUSDC);
    await mockUSDCToken.mintFor(vault.address, BigNumber.from('10000000000000000000000'));

    //add tracked asset
    const args = [mockUSDCToken.address];
    var encodedAddresses = ethers.utils.defaultAbiCoder.encode(['address[]'], [args]);
    var trackedAssetResultTx = await comptroller.callOnExtension(
      integrationManager.address,
      ethers.BigNumber.from('1'),
      encodedAddresses,
    );
    const receipt = await trackedAssetResultTx.wait();
    expect(receipt.status).to.equal(1);

    expect(await vault.getTrackedAssets()).to.be.contains(mockUSDCToken.address);
    expect(await vault.getTrackedAssets()).to.be.contains(mockBUSDToken.address);

    const redeemShares = await comptroller.connect(accounts[1]).redeemSharesDetailed('0', [], []);
    const redeemSharesReceipt = await redeemShares.wait();
    const { sharesQuantity, receivedAssets } = extractEventArgs(redeemSharesReceipt, 'SharesRedeemed');
    expect(depositAmount).to.equal(sharesQuantity.toString());
    expect(mockBUSDToken.address).to.equal(receivedAssets[0]);
    expect(await vault.getTrackedAssets()).to.be.not.contains(mockUSDCToken.address);
    expect(await vault.getTrackedAssets()).to.be.contains(mockBUSDToken.address);
  });
  it('Should send the proportional number of assets relative to the percentage of vault shares redeemed', async function () {
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    const depositAmount = '100';
    const buyShareResult = await comptroller
      .connect(accounts[1])
      .buyShares(depositAmount, 0, ethers.constants.AddressZero);
    await buyShareResult.wait();
    const busdVaultBalance = await mockBUSDToken.balanceOf(vault.address);
    const vaultTotalSupply = await vault.totalSupply();
    const sharesToRedeem = BigNumber.from('10');
    const redeemShares = await comptroller.connect(accounts[1]).redeemSharesDetailed(sharesToRedeem, [], []);
    const redeemSharesReceipt = await redeemShares.wait();
    const { receivedAssetQuantities, receivedAssets } = extractEventArgs(redeemSharesReceipt, 'SharesRedeemed');
    expect(receivedAssetQuantities[0]).to.equal(sharesToRedeem.mul(busdVaultBalance).div(vaultTotalSupply));
    expect(receivedAssets[0]).to.equal(mockBUSDToken.address);
  });
});

describe('ComptrollerLib redeemSharesAndSwap Tests [ @skip-on-coverage ]', function () {
  let abiCoder;
  let investor;
  let takeOrderInterface;
  let denominationAsset;
  let tradedAsset1;
  let tradedAsset2;
  let denominationAssetToDenominationAssetPath;
  let tradedAsset1ToDenominationAssetPath;
  let tradedAsset2ToDenominationAssetPath;

  const sharesActionTimeLock = 24 * 60 * 60;
  const assetWithdrawnEventABI = 'event AssetWithdrawn(address indexed asset, address indexed target, uint256 amount)';
  const assetSwappedAndTransferredEventABI =
    'event AssetSwappedAndTransferred(address indexed sourceAsset,address indexed destinationAsset,address indexed target,uint256 sourceAmount,uint256 destinationAmount)';
  beforeEach(async function () {
    investor = accounts[2];
    abiCoder = new utils.AbiCoder();
    takeOrderInterface = new utils.Interface([takeOrderABI]);

    denominationAsset = mockBUSDToken;
    tradedAsset1 = mockUSDC;
    tradedAsset2 = mockDAI;

    denominationAssetToDenominationAssetPath = [denominationAsset.address, denominationAsset.address];
    tradedAsset1ToDenominationAssetPath = [tradedAsset1.address, denominationAsset.address];
    tradedAsset2ToDenominationAssetPath = [tradedAsset2.address, denominationAsset.address];

    const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
    const fndzController = FNDZController.attach(contractAddresses.FNDZController);

    const tx = await fndzController.createNewFund(
      deployer.address,
      'Test Fund 1',
      contractAddresses.mockTokens.MockBUSD,
      sharesActionTimeLock,
      emptyConfigData,
      emptyConfigData,
    );
    const receipt = await tx.wait();
    ({ comptrollerProxy, vaultProxy } = getFundAddresses(receipt));

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    comptroller = ComptrollerLib.attach(comptrollerProxy);

    const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
    vault = VaultLib.attach(vaultProxy);

    await denominationAsset.connect(investor).approve(comptrollerProxy, utils.parseEther('3'));
    await denominationAsset.mintFor(investor.address, utils.parseEther('3'));
    await comptroller.connect(investor).buyShares(utils.parseEther('3'), 0, ethers.constants.AddressZero);

    // Trade denominationAsset -> tradedAsset1
    const samplePath = [
      [
        tradedAsset1.address,
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
    let encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      utils.parseEther('1'),
      utils.parseEther('1'),
      denominationAsset.address,
      utils.parseEther('1'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePath,
    ]);
    let encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contractAddresses.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Trade denominationAsset -> tradedAsset1
    samplePath[0][0] = tradedAsset2.address;
    encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      utils.parseEther('1'),
      utils.parseEther('1'),
      denominationAsset.address,
      utils.parseEther('1'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePath,
    ]);
    encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contractAddresses.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);
  });
  it('sharesQuantity must be greater than zero', async function () {
    const swapData = abiCoder.encode(['address[][]', 'uint256[]', 'uint256'], [[[], [], []], [0, 0, 0], 0]);
    await expect(comptroller.connect(investor).redeemSharesAndSwap(0, swapData)).to.revertedWith(
      'redeemSharesAndSwap: _sharesQuantity must be >0',
    );
  });
  it('swapPaths and minSwapAmounts lengths should be same', async function () {
    const swapData = abiCoder.encode(['address[][]', 'uint256[]', 'uint256'], [[[], []], [0, 0, 0], 0]);
    await expect(comptroller.connect(investor).redeemSharesAndSwap(utils.parseEther('0.1'), swapData)).to.revertedWith(
      'redeemSharesAndSwap: swapPaths length must be minimumDestinationAmounts length',
    );
  });
  it('Should not be able to redeem while in sharesAction time lock', async function () {
    const swapData = abiCoder.encode(['address[][]', 'uint256[]', 'uint256'], [[[]], [0], 0]);
    await expect(comptroller.connect(investor).redeemSharesAndSwap(utils.parseEther('0.1'), swapData)).to.revertedWith(
      'Shares action timelocked',
    );
  });
  it('Should be able to redeem shares on sharesActionTimeLock span if the vault has pending migration request', async function () {
    /// Migrating Fund Setup ///
    const Dispatcher = await ethers.getContractFactory('Dispatcher', deployer.address);
    const dispatcher = Dispatcher.attach(contractAddresses.Dispatcher);

    const FundDeployer = await hre.ethers.getContractFactory('FundDeployer', deployer);
    const newFundDeployer = await FundDeployer.deploy(dispatcher.address, contractAddresses.FNDZController, [], []);
    await newFundDeployer.deployed();

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer.address);
    const comptrollerLib = await ComptrollerLib.deploy(
      dispatcher.address,
      newFundDeployer.address,
      contractAddresses.ValueInterpreter,
      contractAddresses.FeeManager,
      contractAddresses.IntegrationManager,
      contractAddresses.PolicyManager,
      contractAddresses.ChainlinkPriceFeed,
    );

    await newFundDeployer.setComptrollerLib(comptrollerLib.address);
    await newFundDeployer.setReleaseStatus(1); // set new fund deployer release status to live

    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);

    // Initiate the Migration
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      sharesActionTimeLock,
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
    const swapData = abiCoder.encode(['address[][]', 'uint256[]', 'uint256'], [[[], [], []], [0, 0, 0], 0]);
    await expect(comptroller.connect(investor).redeemSharesAndSwap(utils.parseEther('0.1'), swapData)).to.not.reverted;
  });
  it('Revert if sharesQuantity is greater than available', async function () {
    // Advancing the time to complete the sharesActionTimeLock
    await advanceTime(sharesActionTimeLock);

    const swapData = abiCoder.encode(['address[][]', 'uint256[]', 'uint256'], [[[]], [0], 0]);
    await expect(comptroller.connect(investor).redeemSharesAndSwap(utils.parseEther('10'), swapData)).to.revertedWith(
      'redeemSharesAndSwap: Insufficient shares',
    );
  });
  it('length of asset under vault should match the length of swap paths', async function () {
    // Advancing the time to complete the sharesActionTimeLock
    await advanceTime(sharesActionTimeLock);

    const swapData = abiCoder.encode(['address[][]', 'uint256[]', 'uint256'], [[[]], [0], 0]);
    await expect(comptroller.connect(investor).redeemSharesAndSwap(utils.parseEther('0.1'), swapData)).to.revertedWith(
      'redeemSharesAndSwap: payoutAssets_ length must match swapPaths',
    );
  });
  it('source asset of swap Path should match the order of tracked asset', async function () {
    // Advancing the time to complete the sharesActionTimeLock
    await advanceTime(sharesActionTimeLock);

    const swapData = abiCoder.encode(
      ['address[][]', 'uint256[]', 'uint256'],
      [[[], tradedAsset2ToDenominationAssetPath, []], [0, 0, 0], 0],
    );
    await expect(comptroller.connect(investor).redeemSharesAndSwap(utils.parseEther('0.1'), swapData)).to.revertedWith(
      'swapAndWithdrawAssetTo: first element of _swapPath must be _sourceAsset',
    );
  });
  it('destination asset of swap Path should be denomination asset', async function () {
    // Advancing the time to complete the sharesActionTimeLock
    await advanceTime(sharesActionTimeLock);

    const swapData = abiCoder.encode(
      ['address[][]', 'uint256[]', 'uint256'],
      [[[], [tradedAsset1.address, tradedAsset2.address], []], [0, 0, 0], 0],
    );
    await expect(comptroller.connect(investor).redeemSharesAndSwap(utils.parseEther('0.1'), swapData)).to.revertedWith(
      'swapAndWithdrawAssetTo: last element of _swapPath must be _destinationAsset',
    );
  });
  it('Should redeem vault assets if swapPath is empty', async function () {
    // Advancing the time to complete the sharesActionTimeLock
    await advanceTime(sharesActionTimeLock);

    const vaultDenominationAssetBalance = await denominationAsset.balanceOf(vault.address);
    const vaultTradedAsset1Balance = await tradedAsset1.balanceOf(vault.address);
    const vaultTradedAsset2Balance = await tradedAsset2.balanceOf(vault.address);

    const totalSharesSupply = await vault.totalSupply();

    const swapData = abiCoder.encode(['address[][]', 'uint256[]', 'uint256'], [[[], [], []], [0, 0, 0], 0]);
    const redeemTx = await comptroller.connect(investor).redeemSharesAndSwap(utils.parseEther('0.1'), swapData);
    const redeemReceipt = await redeemTx.wait();

    // RedeemShare Event
    const sharesRedeemedEvents = filterEventsByABI(redeemReceipt, [sharesRedeemedABI]);
    expect(sharesRedeemedEvents.length).to.equal(1);
    const sharesRedeemedEvent = sharesRedeemedEvents[0].args;
    expect(sharesRedeemedEvent.sharesQuantity).to.equal(utils.parseEther('0.1'));
    expect(sharesRedeemedEvent.receivedAssets.length).to.equal(3);
    expect(sharesRedeemedEvent.receivedAssets[0]).to.equal(denominationAsset.address);
    expect(sharesRedeemedEvent.receivedAssets[1]).to.equal(tradedAsset1.address);
    expect(sharesRedeemedEvent.receivedAssets[2]).to.equal(tradedAsset2.address);
    expect(sharesRedeemedEvent.receivedAssetQuantities.length).to.equal(3);
    const receivedDenominationAssetQuantity = sharesRedeemedEvent.receivedAssetQuantities[0];
    const receivedTradedAsset1Quantity = sharesRedeemedEvent.receivedAssetQuantities[1];
    const receivedTradedAsset2Quantity = sharesRedeemedEvent.receivedAssetQuantities[2];
    expect(receivedDenominationAssetQuantity).to.equal(
      vaultDenominationAssetBalance.mul(sharesRedeemedEvent.sharesQuantity).div(totalSharesSupply),
    );
    expect(receivedTradedAsset1Quantity).to.equal(
      vaultTradedAsset1Balance.mul(sharesRedeemedEvent.sharesQuantity).div(totalSharesSupply),
    );
    expect(receivedTradedAsset2Quantity).to.equal(
      vaultTradedAsset2Balance.mul(sharesRedeemedEvent.sharesQuantity).div(totalSharesSupply),
    );

    // Asset Withdrawn To Event
    const assetWithdrawnEvents = filterEventsByABI(redeemReceipt, [assetWithdrawnEventABI]);
    expect(assetWithdrawnEvents.length).to.equal(3);
    let assetWithdrawnEvent = assetWithdrawnEvents[0].args;
    expect(assetWithdrawnEvent.asset).to.equal(denominationAsset.address);
    expect(assetWithdrawnEvent.target).to.equal(investor.address);
    expect(assetWithdrawnEvent.amount).to.equal(receivedDenominationAssetQuantity);
    assetWithdrawnEvent = assetWithdrawnEvents[1].args;
    expect(assetWithdrawnEvent.asset).to.equal(tradedAsset1.address);
    expect(assetWithdrawnEvent.target).to.equal(investor.address);
    expect(assetWithdrawnEvent.amount).to.equal(receivedTradedAsset1Quantity);
    assetWithdrawnEvent = assetWithdrawnEvents[2].args;
    expect(assetWithdrawnEvent.asset).to.equal(tradedAsset2.address);
    expect(assetWithdrawnEvent.target).to.equal(investor.address);
    expect(assetWithdrawnEvent.amount).to.equal(receivedTradedAsset2Quantity);

    // Investor balance checks
    expect(await denominationAsset.balanceOf(investor.address)).to.equal(receivedDenominationAssetQuantity);
    expect(await tradedAsset1.balanceOf(investor.address)).to.equal(receivedTradedAsset1Quantity);
    expect(await tradedAsset2.balanceOf(investor.address)).to.equal(receivedTradedAsset2Quantity);
  });

  it('Should be able redeem using only partial swap data', async function () {
    // Advancing the time to complete the sharesActionTimeLock
    await advanceTime(sharesActionTimeLock);

    const vaultDenominationAssetBalance = await denominationAsset.balanceOf(vault.address);
    const vaultTradedAsset1Balance = await tradedAsset1.balanceOf(vault.address);
    const vaultTradedAsset2Balance = await tradedAsset2.balanceOf(vault.address);

    const totalSharesSupply = await vault.totalSupply();

    const swapData = abiCoder.encode(
      ['address[][]', 'uint256[]', 'uint256'],
      [[[], tradedAsset1ToDenominationAssetPath, []], [0, utils.parseEther('1'), 0], 0],
    );
    const redeemTx = await comptroller.connect(investor).redeemSharesAndSwap(utils.parseEther('0.1'), swapData);
    const redeemReceipt = await redeemTx.wait();

    // RedeemShare Event
    const sharesRedeemedEvents = filterEventsByABI(redeemReceipt, [sharesRedeemedABI]);
    expect(sharesRedeemedEvents.length).to.equal(1);
    const sharesRedeemedEvent = sharesRedeemedEvents[0].args;
    expect(sharesRedeemedEvent.sharesQuantity).to.equal(utils.parseEther('0.1'));
    expect(sharesRedeemedEvent.receivedAssets.length).to.equal(3);
    expect(sharesRedeemedEvent.receivedAssets[0]).to.equal(denominationAsset.address);
    expect(sharesRedeemedEvent.receivedAssets[1]).to.equal(denominationAsset.address);
    expect(sharesRedeemedEvent.receivedAssets[2]).to.equal(tradedAsset2.address);
    expect(sharesRedeemedEvent.receivedAssetQuantities.length).to.equal(3);
    const receivedDenominationAssetQuantity = sharesRedeemedEvent.receivedAssetQuantities[0];
    const receivedDenominationAssetQuantityBySwap1 = sharesRedeemedEvent.receivedAssetQuantities[1];
    const receivedTradedAsset2Quantity = sharesRedeemedEvent.receivedAssetQuantities[2];
    expect(receivedDenominationAssetQuantity).to.equal(
      vaultDenominationAssetBalance.mul(sharesRedeemedEvent.sharesQuantity).div(totalSharesSupply),
    );
    expect(receivedTradedAsset2Quantity).to.equal(
      vaultTradedAsset2Balance.mul(sharesRedeemedEvent.sharesQuantity).div(totalSharesSupply),
    );

    const redeemedTradedAsset1QuantityExpected = vaultTradedAsset1Balance
      .mul(sharesRedeemedEvent.sharesQuantity)
      .div(totalSharesSupply);
    expect(vaultTradedAsset1Balance.sub(await tradedAsset1.balanceOf(vault.address))).to.equal(
      redeemedTradedAsset1QuantityExpected,
    );

    // Asset Withdrawn To Event
    const assetWithdrawnEvents = filterEventsByABI(redeemReceipt, [assetWithdrawnEventABI]);
    expect(assetWithdrawnEvents.length).to.equal(2);
    let assetWithdrawnEvent = assetWithdrawnEvents[0].args;
    expect(assetWithdrawnEvent.asset).to.equal(denominationAsset.address);
    expect(assetWithdrawnEvent.target).to.equal(investor.address);
    expect(assetWithdrawnEvent.amount).to.equal(receivedDenominationAssetQuantity);
    assetWithdrawnEvent = assetWithdrawnEvents[1].args;
    expect(assetWithdrawnEvent.asset).to.equal(tradedAsset2.address);
    expect(assetWithdrawnEvent.target).to.equal(investor.address);
    expect(assetWithdrawnEvent.amount).to.equal(receivedTradedAsset2Quantity);

    // Asset Swapped and Withdrawn Event
    const assetSwappedAndTransferredEvents = filterEventsByABI(redeemReceipt, [assetSwappedAndTransferredEventABI]);
    expect(assetSwappedAndTransferredEvents.length).to.equal(1);
    const assetSwappedAndTransferredEvent = assetSwappedAndTransferredEvents[0].args;
    expect(assetSwappedAndTransferredEvent.sourceAsset).to.equal(tradedAsset1.address);
    expect(assetSwappedAndTransferredEvent.destinationAsset).to.equal(denominationAsset.address);
    expect(assetSwappedAndTransferredEvent.target).to.equal(investor.address);
    expect(assetSwappedAndTransferredEvent.sourceAmount).to.equal(redeemedTradedAsset1QuantityExpected);
    expect(assetSwappedAndTransferredEvent.destinationAmount).to.equal(receivedDenominationAssetQuantityBySwap1);

    // Investor balance checks
    expect(await denominationAsset.balanceOf(investor.address)).to.equal(
      receivedDenominationAssetQuantity.add(receivedDenominationAssetQuantityBySwap1),
    );
    expect(await tradedAsset1.balanceOf(investor.address)).to.equal(0);
    expect(await tradedAsset2.balanceOf(investor.address)).to.equal(receivedTradedAsset2Quantity);
  });

  it('Should be able redeem by swapping all the traded assets', async function () {
    // Advancing the time to complete the sharesActionTimeLock
    await advanceTime(sharesActionTimeLock);

    const vaultDenominationAssetBalance = await denominationAsset.balanceOf(vault.address);
    const vaultTradedAsset1Balance = await tradedAsset1.balanceOf(vault.address);
    const vaultTradedAsset2Balance = await tradedAsset2.balanceOf(vault.address);

    const totalSharesSupply = await vault.totalSupply();

    const swapData = abiCoder.encode(
      ['address[][]', 'uint256[]', 'uint256'],
      [
        [
          denominationAssetToDenominationAssetPath,
          tradedAsset1ToDenominationAssetPath,
          tradedAsset2ToDenominationAssetPath,
        ],
        [utils.parseEther('1'), utils.parseEther('1'), utils.parseEther('1')],
        0,
      ],
    );
    const redeemTx = await comptroller.connect(investor).redeemSharesAndSwap(utils.parseEther('0.1'), swapData);
    const redeemReceipt = await redeemTx.wait();

    // RedeemShare Event
    const sharesRedeemedEvents = filterEventsByABI(redeemReceipt, [sharesRedeemedABI]);
    expect(sharesRedeemedEvents.length).to.equal(1);
    const sharesRedeemedEvent = sharesRedeemedEvents[0].args;
    expect(sharesRedeemedEvent.sharesQuantity).to.equal(utils.parseEther('0.1'));
    expect(sharesRedeemedEvent.receivedAssets.length).to.equal(3);
    expect(sharesRedeemedEvent.receivedAssets[0]).to.equal(denominationAsset.address);
    expect(sharesRedeemedEvent.receivedAssets[1]).to.equal(denominationAsset.address);
    expect(sharesRedeemedEvent.receivedAssets[2]).to.equal(denominationAsset.address);
    expect(sharesRedeemedEvent.receivedAssetQuantities.length).to.equal(3);
    const receivedDenominationAssetQuantity = sharesRedeemedEvent.receivedAssetQuantities[0];
    const receivedDenominationAssetQuantityBySwap1 = sharesRedeemedEvent.receivedAssetQuantities[1];
    const receivedDenominationAssetQuantityBySwap2 = sharesRedeemedEvent.receivedAssetQuantities[2];

    const redeemedDenominationAssetQuantityExpected = vaultDenominationAssetBalance
      .mul(sharesRedeemedEvent.sharesQuantity)
      .div(totalSharesSupply);
    expect(vaultDenominationAssetBalance.sub(await denominationAsset.balanceOf(vault.address))).to.equal(
      redeemedDenominationAssetQuantityExpected,
    );
    const redeemedTradedAsset1QuantityExpected = vaultTradedAsset1Balance
      .mul(sharesRedeemedEvent.sharesQuantity)
      .div(totalSharesSupply);
    expect(vaultTradedAsset1Balance.sub(await tradedAsset1.balanceOf(vault.address))).to.equal(
      redeemedTradedAsset1QuantityExpected,
    );
    const redeemedTradedAsset2QuantityExpected = vaultTradedAsset2Balance
      .mul(sharesRedeemedEvent.sharesQuantity)
      .div(totalSharesSupply);
    expect(vaultTradedAsset2Balance.sub(await tradedAsset2.balanceOf(vault.address))).to.equal(
      redeemedTradedAsset2QuantityExpected,
    );

    // Asset Swapped and Withdrawn Event
    const assetSwappedAndTransferredEvents = filterEventsByABI(redeemReceipt, [assetSwappedAndTransferredEventABI]);
    expect(assetSwappedAndTransferredEvents.length).to.equal(3);
    let assetSwappedAndTransferredEvent = assetSwappedAndTransferredEvents[0].args;
    expect(assetSwappedAndTransferredEvent.sourceAsset).to.equal(denominationAsset.address);
    expect(assetSwappedAndTransferredEvent.destinationAsset).to.equal(denominationAsset.address);
    expect(assetSwappedAndTransferredEvent.target).to.equal(investor.address);
    expect(assetSwappedAndTransferredEvent.sourceAmount).to.equal(redeemedDenominationAssetQuantityExpected);
    expect(assetSwappedAndTransferredEvent.destinationAmount).to.equal(receivedDenominationAssetQuantity);
    assetSwappedAndTransferredEvent = assetSwappedAndTransferredEvents[1].args;
    expect(assetSwappedAndTransferredEvent.sourceAsset).to.equal(tradedAsset1.address);
    expect(assetSwappedAndTransferredEvent.destinationAsset).to.equal(denominationAsset.address);
    expect(assetSwappedAndTransferredEvent.target).to.equal(investor.address);
    expect(assetSwappedAndTransferredEvent.sourceAmount).to.equal(redeemedTradedAsset1QuantityExpected);
    expect(assetSwappedAndTransferredEvent.destinationAmount).to.equal(receivedDenominationAssetQuantityBySwap1);
    assetSwappedAndTransferredEvent = assetSwappedAndTransferredEvents[2].args;
    expect(assetSwappedAndTransferredEvent.sourceAsset).to.equal(tradedAsset2.address);
    expect(assetSwappedAndTransferredEvent.destinationAsset).to.equal(denominationAsset.address);
    expect(assetSwappedAndTransferredEvent.target).to.equal(investor.address);
    expect(assetSwappedAndTransferredEvent.sourceAmount).to.equal(redeemedTradedAsset2QuantityExpected);
    expect(assetSwappedAndTransferredEvent.destinationAmount).to.equal(receivedDenominationAssetQuantityBySwap2);

    // Investor balance checks
    expect(await denominationAsset.balanceOf(investor.address)).to.equal(
      receivedDenominationAssetQuantity
        .add(receivedDenominationAssetQuantityBySwap1)
        .add(receivedDenominationAssetQuantityBySwap2),
    );
    expect(await tradedAsset1.balanceOf(investor.address)).to.equal(0);
    expect(await tradedAsset2.balanceOf(investor.address)).to.equal(0);
  });
});

describe('Re-Entrancy Tests', function () {
  beforeEach(async function () {
    chainlinkPriceFeed.addPrimitives(
      [mockReentrancyToken.address],
      [contractAddresses.mockContracts.MockChainlinkAggregator],
      [0],
    );
    await fndzController.addDenominationAssets([mockReentrancyToken.address]);

    const onePercentScaledPerSecondRate = convertRateToScaledPerSecondRate(utils.parseEther('0.01'));
    const encodedFeeParams = abiCoder.encode(['uint'], [onePercentScaledPerSecondRate]);
    const encodedFeeData = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [[contractAddresses.ManagementFee], [encodedFeeParams]],
    );

    const tx = await fndzController.createNewFund(
      deployer.address,
      'Test Fund',
      mockReentrancyToken.address,
      '1',
      encodedFeeData,
      emptyConfigData,
    );
    const receipt = await tx.wait();
    ({ comptrollerProxy, vaultProxy } = getFundAddresses(receipt));

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    comptroller = ComptrollerLib.attach(comptrollerProxy);
  });

  it('buyShares', async function () {
    await mockReentrancyToken.makeItReentracyToken(comptrollerProxy);
    await expect(comptroller.buyShares(utils.parseEther('10'), 0, ethers.constants.AddressZero)).to.be.revertedWith(
      'Re-entrance',
    );
  });

  it('redeemSharesDetailed', async function () {
    await comptroller.buyShares(utils.parseEther('10'), 0, ethers.constants.AddressZero);

    await mockReentrancyToken.makeItReentracyToken(comptrollerProxy);
    await expect(comptroller.redeemSharesDetailed(utils.parseEther('10'), [], [])).to.revertedWith('Re-entrance');
  });

  it('redeemSharesAndSwap', async function () {
    await comptroller.buyShares(utils.parseEther('10'), 0, ethers.constants.AddressZero);

    const swapData = abiCoder.encode(['address[][]', 'uint256[]', 'uint256'], [[[]], [0], 0]);
    await mockReentrancyToken.makeItReentracyToken(comptrollerProxy);
    await expect(comptroller.redeemSharesAndSwap(utils.parseEther('10'), swapData)).to.revertedWith('Re-entrance');
  });

  it('callOnExtension', async function () {
    await comptroller.buyShares(utils.parseEther('20'), 0, ethers.constants.AddressZero);
    const takeOrderInterface = new utils.Interface([takeOrderABI]);
    const samplePath = [
      [
        contractAddresses.mockTokens.MockBUSD,
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
      mockReentrancyToken.address,
      utils.parseEther('10'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePath,
    ]);
    const encodedData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contractAddresses.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    const MockParaSwapV5AugustusSwapper = await ethers.getContractFactory('MockParaSwapV5AugustusSwapper', deployer);
    const mockParaSwapV5AugustusSwapper = MockParaSwapV5AugustusSwapper.attach(
      contractAddresses.MockParaSwapV5AugustusSwapper,
    );
    await mockParaSwapV5AugustusSwapper.makeItReentracyToken(comptroller.address);
    await expect(comptroller.callOnExtension(integrationManager.address, 0, encodedData)).to.revertedWith(
      'Re-entrance',
    );
  });
});
