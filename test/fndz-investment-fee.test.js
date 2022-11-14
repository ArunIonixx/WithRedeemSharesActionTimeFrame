/* eslint-disable @typescript-eslint/no-var-requires */
const { expect } = require('chai');
const { BigNumber, utils } = require('ethers');
const { ethers } = require('hardhat');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { deployments } = require('./utils/deploy-test-contracts.js');
const {
  emptyConfigData,
  getFundAddresses,
  filterEventsByABI,
  comptrollerProxyDeployedEventABI,
  takeOrderABI,
  paraSwapV5CallArgsEncodeType,
  advanceTime,
} = require('./utils/fndz-utilities.js');
const { convertRateToScaledPerSecondRate } = require('./utils/management-fee.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let fndzInvestmentRegistry;
let fndzInvestmentFee;
let comptrollerProxy;
let comptrollerLib;
let fndzController;
let vaultProxy;
let vaultLib;
let busdToken;
let fndzToken;
let abiCoder;
let feeRate;
let encodeFndzInvestFeeConfig;
let takeOrderInterface;
let samplePathV5;
let fundActionsWrapper;

const settledEventABI =
  'event Settled(address indexed comptrollerProxy, address indexed payer, uint256 investmentQuantity)';
const LockedAmountUpdatedEventABI =
  'event LockedBalanceUpdated(address comptrollerProxy, uint256 oldBalance, uint256 newBalance)';
const InlineSwapFailedEventABI =
  'event InlineSwapFailed(bytes failureReturnData,address comptrollerProxy,address sourceAsset,address destinationAsset,uint256 amount)';
const SharesRedeemedEventABI =
  'event SharesRedeemed(address indexed redeemer,uint256 sharesQuantity,address[] receivedAssets,uint256[] receivedAssetQuantities,bool isVirtual)';
const FeeSetEventABI = 'event FeeAddressSet(address _old, address _new)';
const AssetSwappedEventABI =
  'event AssetSwappedAndTransferred(address indexed sourceAsset,address indexed destinationAsset,address indexed target,uint256 sourceAmount,uint256 destinationAmount)';

beforeEach(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  abiCoder = new utils.AbiCoder();

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contracts.FNDZController);

  const FNDZInvestmentRegistry = await ethers.getContractFactory('FNDZInvestmentRegistry', deployer);
  fndzInvestmentRegistry = FNDZInvestmentRegistry.attach(contracts.FNDZInvestmentRegistry);

  const FNDZInvestmentFee = await ethers.getContractFactory('FNDZInvestmentFee', deployer);
  fndzInvestmentFee = FNDZInvestmentFee.attach(contracts.FNDZInvestmentFee);

  feeRate = ethers.utils.parseEther('0.01');
  const encodedFeeParams = abiCoder.encode(['uint256'], [feeRate]);
  encodeFndzInvestFeeConfig = abiCoder.encode(
    ['address[]', 'bytes[]'],
    [[fndzInvestmentFee.address], [encodedFeeParams]],
  );

  /// Creating a Vault
  const createVaultTx = await fndzController.createNewFund(
    deployer.address,
    'Test Vault',
    contracts.mockTokens.MockBUSD,
    '1',
    encodeFndzInvestFeeConfig,
    emptyConfigData,
  );
  const response = await createVaultTx.wait();
  ({ comptrollerProxy, vaultProxy } = await getFundAddresses(response));

  const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
  comptrollerLib = ComptrollerLib.attach(comptrollerProxy);

  const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
  vaultLib = VaultLib.attach(vaultProxy);

  const FundActionsWrapper = await ethers.getContractFactory('FundActionsWrapper', deployer);
  fundActionsWrapper = FundActionsWrapper.attach(contracts.FundActionsWrapper);

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  busdToken = MockToken.attach(contracts.mockTokens.MockBUSD);
  fndzToken = MockToken.attach(contracts.mockTokens.MockFNDZ);

  // approving busd token
  await busdToken.approve(comptrollerLib.address, utils.parseEther('100'));

  // Uniswap pair creation and registering
  // BUSD to FNDZ Pair
  const BUSDToFNDZPair = await ethers.getContractFactory('MockUniswapV2Pair', deployer);
  const busdToFndzPair = await BUSDToFNDZPair.deploy(
    busdToken.address,
    fndzToken.address,
    utils.parseEther('1000'),
    utils.parseEther('1000'),
    BigNumber.from('1000'),
  );
  const MockUniswapV2Factory = await hre.ethers.getContractFactory('MockUniswapV2Factory', deployer);
  const mockUniswapV2Factory = MockUniswapV2Factory.attach(contracts.MockUniswapV2Factory);
  await mockUniswapV2Factory.registerPair(busdToken.address, fndzToken.address, busdToFndzPair.address);

  takeOrderInterface = new utils.Interface([takeOrderABI]);

  samplePathV5 = [
    [
      contracts.mockTokens.MockUSDC,
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
});

describe('FNDZ Invest Fee Test Suite', function () {
  it('Should invest fndz token on deposit and update the locked amount', async function () {
    const investmentAmount = utils.parseEther('1');
    const investmentSplit = investmentAmount.mul(feeRate).div(utils.parseEther('1'));
    const buySharesTx = await comptrollerLib.buyShares(utils.parseEther('1'), 0, ethers.constants.AddressZero);
    const receipt = await buySharesTx.wait();
    const settledEvents = filterEventsByABI(receipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(1);
    expect(settledEvents[0].args.comptrollerProxy).to.equal(comptrollerLib.address);
    expect(settledEvents[0].args.payer).to.equal(deployer.address);
    expect(settledEvents[0].args.investmentQuantity).to.equal(investmentAmount.mul(feeRate).div(utils.parseEther('1')));
    const inlineSwapFailedEvents = filterEventsByABI(receipt, [InlineSwapFailedEventABI]);
    expect(inlineSwapFailedEvents.length).to.equal(0);
    const lockedAmountUpdatedEvents = filterEventsByABI(receipt, [LockedAmountUpdatedEventABI]);
    expect(lockedAmountUpdatedEvents.length).to.equal(1);
    expect(lockedAmountUpdatedEvents[0].args.oldBalance).to.equal(0);
    const expectedLockedBalance = BigNumber.from('9499905000949990');
    expect(lockedAmountUpdatedEvents[0].args.newBalance).to.equal(expectedLockedBalance);
    expect(await fndzToken.balanceOf(vaultLib.address)).to.equal(expectedLockedBalance);
    expect(await fndzInvestmentRegistry.getLockedAmount(vaultLib.address)).to.equal(expectedLockedBalance);
    const assetSwappedEvents = filterEventsByABI(receipt, [AssetSwappedEventABI]);
    expect(assetSwappedEvents.length).to.equal(1);
    expect(assetSwappedEvents[0].args.sourceAsset).to.equal(busdToken.address);
    expect(assetSwappedEvents[0].args.sourceAmount).to.equal(investmentSplit);
    expect(assetSwappedEvents[0].args.destinationAsset).to.equal(fndzToken.address);
    expect(assetSwappedEvents[0].args.destinationAmount).to.equal(expectedLockedBalance);
    expect(assetSwappedEvents[0].args.target).to.equal(vaultLib.address);
  });

  it('Should withdraw fndz token on redeem shares and update the locked amount', async function () {
    await comptrollerLib.buyShares(utils.parseEther('1'), 0, ethers.constants.AddressZero);
    const fndzBalance = await fndzToken.balanceOf(vaultLib.address);
    expect(fndzBalance).to.equal(BigNumber.from('9499905000949990'));
    const prevLockedBalance = await fndzInvestmentRegistry.getLockedAmount(vaultLib.address);

    const redeemTx = await comptrollerLib.redeemSharesDetailed(utils.parseEther('0.5'), [], []);
    const receipt = await redeemTx.wait();
    const sharesRedeemedEvents = filterEventsByABI(receipt, [SharesRedeemedEventABI]);
    expect(sharesRedeemedEvents.length).to.equal(1);
    const receivedAssets = sharesRedeemedEvents[0].args.receivedAssets;
    const receivedAssetQuantities = sharesRedeemedEvents[0].args.receivedAssetQuantities;
    expect(receivedAssets).to.be.contains(fndzToken.address);
    const redeemedFndzToken = receivedAssetQuantities[receivedAssets.indexOf(fndzToken.address)];
    expect(redeemedFndzToken).to.equal(BigNumber.from('4749952500474995'));
    const expectedLockedBalance = prevLockedBalance.sub(redeemedFndzToken);
    const settledEvents = filterEventsByABI(receipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(0);
    const lockedAmountUpdatedEvents = filterEventsByABI(receipt, [LockedAmountUpdatedEventABI]);
    expect(lockedAmountUpdatedEvents.length).to.equal(1);
    expect(lockedAmountUpdatedEvents[0].args.oldBalance).to.equal(prevLockedBalance);
    expect(lockedAmountUpdatedEvents[0].args.newBalance).to.equal(expectedLockedBalance);
    expect(await fndzToken.balanceOf(vaultLib.address)).to.equal(expectedLockedBalance);
    expect(await fndzInvestmentRegistry.getLockedAmount(vaultLib.address)).to.equal(expectedLockedBalance);
  });

  it('Should withdraw fndz token on redeemSharesAndSwap and update the locked amount', async function () {
    await comptrollerLib.buyShares(utils.parseEther('1'), 0, ethers.constants.AddressZero);
    const fndzBalance = await fndzToken.balanceOf(vaultLib.address);
    expect(fndzBalance).to.equal(BigNumber.from('9499905000949990'));
    const prevLockedBalance = await fndzInvestmentRegistry.getLockedAmount(vaultLib.address);

    const swapData = abiCoder.encode(['address[][]', 'uint256[]', 'uint256'], [[[], []], [0, 0], 0]);
    const redeemTx = await comptrollerLib.redeemSharesAndSwap(utils.parseEther('0.5'), swapData);
    const receipt = await redeemTx.wait();

    const sharesRedeemedEvents = filterEventsByABI(receipt, [SharesRedeemedEventABI]);
    expect(sharesRedeemedEvents.length).to.equal(1);
    const receivedAssets = sharesRedeemedEvents[0].args.receivedAssets;
    const receivedAssetQuantities = sharesRedeemedEvents[0].args.receivedAssetQuantities;
    expect(receivedAssets).to.be.contains(fndzToken.address);
    const redeemedFndzToken = receivedAssetQuantities[receivedAssets.indexOf(fndzToken.address)];
    expect(redeemedFndzToken).to.equal(BigNumber.from('4749952500474995'));
    const expectedLockedBalance = prevLockedBalance.sub(redeemedFndzToken);
    const settledEvents = filterEventsByABI(receipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(0);
    const lockedAmountUpdatedEvents = filterEventsByABI(receipt, [LockedAmountUpdatedEventABI]);
    expect(lockedAmountUpdatedEvents.length).to.equal(1);
    expect(lockedAmountUpdatedEvents[0].args.oldBalance).to.equal(prevLockedBalance);
    expect(lockedAmountUpdatedEvents[0].args.newBalance).to.equal(expectedLockedBalance);
    expect(await fndzToken.balanceOf(vaultLib.address)).to.equal(expectedLockedBalance);
    expect(await fndzInvestmentRegistry.getLockedAmount(vaultLib.address)).to.equal(expectedLockedBalance);
  });

  it('Locked fndz tokens can not be traded', async function () {
    await comptrollerLib.buyShares(utils.parseEther('1'), 0, ethers.constants.AddressZero);
    expect(await fndzToken.balanceOf(vaultLib.address)).to.equal(
      await fndzInvestmentRegistry.getLockedAmount(vaultLib.address),
    );

    const incomingAmount = utils.parseEther('2');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      fndzToken.address,
      1,
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    await expect(comptrollerLib.callOnExtension(contracts.IntegrationManager, 0, encodedTradeData)).to.revertedWith(
      '__preProcessCoI: maxSpendAssetAmount includes the locked tokens',
    );
  });

  it('fndz tokens can be traded if bought through trading', async function () {
    await comptrollerLib.buyShares(utils.parseEther('1'), 0, ethers.constants.AddressZero);
    let fndzBalanceBeforeTrade = await fndzToken.balanceOf(vaultLib.address);
    expect(fndzBalanceBeforeTrade).to.equal(await fndzInvestmentRegistry.getLockedAmount(vaultLib.address));

    const prevLockedBalance = await fndzInvestmentRegistry.getLockedAmount(vaultLib.address);
    expect(await fndzToken.balanceOf(vaultLib.address)).to.equal(prevLockedBalance);

    // Buying FNDZ token through trading
    samplePathV5[0][0] = fndzToken.address;
    const incomingAmount = utils.parseEther('1');
    let encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      utils.parseEther('0.5'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    let encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptrollerLib.callOnExtension(contracts.IntegrationManager, 0, encodedTradeData);
    expect(await fndzToken.balanceOf(vaultLib.address)).to.equal(incomingAmount.add(fndzBalanceBeforeTrade));
    const fndzTokensBought = incomingAmount;

    // If we use more fndz token than locked amount it should revert
    samplePathV5[0][0] = busdToken.address;
    encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      fndzToken.address,
      fndzTokensBought.add(1),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await expect(comptrollerLib.callOnExtension(contracts.IntegrationManager, 0, encodedTradeData)).to.revertedWith(
      '__preProcessCoI: maxSpendAssetAmount includes the locked tokens',
    );

    fndzBalanceBeforeTrade = await fndzToken.balanceOf(vaultLib.address);
    const busdBalanceBeforeTrade = await busdToken.balanceOf(vaultLib.address);
    // The bought tokens can be traded
    samplePathV5[0][0] = busdToken.address;
    encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      fndzToken.address,
      fndzTokensBought,
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptrollerLib.callOnExtension(contracts.IntegrationManager, 0, encodedTradeData);
    expect(await fndzToken.balanceOf(vaultLib.address)).to.equal(fndzBalanceBeforeTrade.sub(fndzTokensBought));
    expect(await busdToken.balanceOf(vaultLib.address)).to.equal(busdBalanceBeforeTrade.add(incomingAmount));

    const newLockedBalance = await fndzInvestmentRegistry.getLockedAmount(vaultLib.address);
    expect(await fndzToken.balanceOf(vaultLib.address)).to.equal(newLockedBalance);
    expect(newLockedBalance).to.equal(prevLockedBalance); // locked balance is unchanged by trade
  });

  it('Migration should not affect the locked amount', async function () {
    await comptrollerLib.buyShares(utils.parseEther('1'), 0, ethers.constants.AddressZero);
    const prevLockedAmount = await fndzInvestmentRegistry.getLockedAmount(vaultLib.address);
    expect(prevLockedAmount).to.equal(await fndzToken.balanceOf(vaultLib.address));

    /// Migrating Fund Setup ///
    const Dispatcher = await ethers.getContractFactory('Dispatcher', deployer.address);
    const dispatcher = Dispatcher.attach(contracts.Dispatcher);

    const FundDeployer = await hre.ethers.getContractFactory('FundDeployer', deployer);
    const newFundDeployer = await FundDeployer.deploy(dispatcher.address, fndzController.address, [], []);
    await newFundDeployer.deployed();

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer.address);
    const newComptrollerLib = await ComptrollerLib.deploy(
      dispatcher.address,
      newFundDeployer.address,
      contracts.ValueInterpreter,
      contracts.FeeManager,
      contracts.IntegrationManager,
      contracts.PolicyManager,
      contracts.ChainlinkPriceFeed,
    );

    await newFundDeployer.setComptrollerLib(newComptrollerLib.address);
    await newFundDeployer.setReleaseStatus(1); // set new fund deployer release status to live

    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    // Initiate the Migration
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      contracts.mockTokens.MockBUSD,
      '1',
      encodeFndzInvestFeeConfig,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;

    await newFundDeployer.signalMigration(vaultLib.address, comptrollerDeployedEvent.comptrollerProxy);
    await newFundDeployer.executeMigration(vaultLib.address);
    /// Migrating Fund Completed ///

    // Creating comptroller instance of newly deployed comptrollerProxy
    const newComptroller = ComptrollerLib.attach(comptrollerDeployedEvent.comptrollerProxy);

    // Trying to trade using newComptroller
    const incomingAmount = utils.parseEther('2');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      fndzToken.address,
      utils.parseEther('0.001'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await expect(newComptroller.callOnExtension(contracts.IntegrationManager, 0, encodedTradeData)).to.revertedWith(
      '__preProcessCoI: maxSpendAssetAmount includes the locked tokens',
    );

    const newLockedAmount = await fndzInvestmentRegistry.getLockedAmount(vaultLib.address);
    expect(newLockedAmount).to.equal(prevLockedAmount); // locked amount unchanged by migration
  });

  it('Payout of management fee should update the locked amount', async function () {
    /// Vault with fees Creation Start
    const managementFeeRate = convertRateToScaledPerSecondRate(ethers.utils.parseEther('0.03'));
    const encodedManagementFeeParams = abiCoder.encode(['uint256'], [managementFeeRate]);
    const fndzInvestmentFeeRate = ethers.utils.parseEther('0.01');
    const encodedFNDZInvestmentFeeParams = abiCoder.encode(['uint256'], [fndzInvestmentFeeRate]);
    const encodeFeeConfig = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [
        [contracts.ManagementFee, fndzInvestmentFee.address],
        [encodedManagementFeeParams, encodedFNDZInvestmentFeeParams],
      ],
    );

    const createVaultTx = await fndzController.createNewFund(
      deployer.address,
      'Test Vault With Fee',
      contracts.mockTokens.MockBUSD,
      '1',
      encodeFeeConfig,
      emptyConfigData,
    );
    const response = await createVaultTx.wait();
    ({ comptrollerProxy, vaultProxy } = await getFundAddresses(response));

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    comptrollerLib = ComptrollerLib.attach(comptrollerProxy);

    const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
    vaultLib = VaultLib.attach(vaultProxy);
    /// Vault creation end

    // approving busd token
    await busdToken.approve(comptrollerLib.address, utils.parseEther('100'));

    await comptrollerLib.buyShares(utils.parseEther('10'), 0, ethers.constants.AddressZero);
    let lockedAmount = await fndzInvestmentRegistry.getLockedAmount(vaultLib.address);
    expect(lockedAmount).to.equal(await fndzToken.balanceOf(vaultLib.address));
    const prevLockedAmount = lockedAmount;

    // Advancing the Time to get the higher management fee
    await advanceTime(2 * 31535999); // 2 year since vault creation

    // Buying shares for lesser value. So the settled management fee of FNDZ token to staking pool
    // will be greater then FNDZInvestment fee of FNDZ token bought
    const buyTx = await comptrollerLib.buyShares(utils.parseEther('0.0001'), 0, ethers.constants.AddressZero);
    const buyReceipt = await buyTx.wait();
    const assetSwappedEvents = filterEventsByABI(buyReceipt, [AssetSwappedEventABI]);
    expect(assetSwappedEvents.length).to.equal(1);
    expect(assetSwappedEvents[0].args.destinationAsset).to.equal(fndzToken.address);
    const investedFNDZToken = assetSwappedEvents[0].args.destinationAmount;

    const lockedBalanceUpdatedEvents = filterEventsByABI(buyReceipt, [LockedAmountUpdatedEventABI]);
    expect(lockedBalanceUpdatedEvents.length).to.equal(1);
    expect(lockedBalanceUpdatedEvents[0].args.comptrollerProxy).to.equal(comptrollerProxy);
    expect(lockedBalanceUpdatedEvents[0].args.oldBalance).to.equal(prevLockedAmount);

    // FNDZ token transferred from vaultProxy to FNDZStakingPool and fndzDAO of FNDZ token when settling Management Fee
    const fndzTransferredToStaking = await fndzToken.balanceOf(fndzController.fndzStakingPool());
    const fndzTransferredToFndzDao = await fndzToken.balanceOf(fndzController.fndzDao());

    lockedAmount = await fndzInvestmentRegistry.getLockedAmount(vaultLib.address);
    expect(lockedAmount).to.equal(
      prevLockedAmount.add(investedFNDZToken).sub(fndzTransferredToStaking.add(fndzTransferredToFndzDao)),
    );
    expect(lockedBalanceUpdatedEvents[0].args.newBalance).to.equal(lockedAmount);
  });

  it('Payout of performance fee should update the locked amount', async function () {
    /// Vault with fees Creation Start
    const performanceFeeRate = ethers.utils.parseEther('0.3');
    const crystallizationPeriod = 30 * 24 * 60 * 60; // Monthly in seconds
    const encodedPerformanceFeeParams = abiCoder.encode(
      ['uint256', 'uint256'],
      [performanceFeeRate, crystallizationPeriod],
    );
    const fndzInvestmentFeeRate = ethers.utils.parseEther('0.01');
    const encodedFNDZInvestmentFeeParams = abiCoder.encode(['uint256'], [fndzInvestmentFeeRate]);
    const encodeFeeConfig = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [
        [contracts.PerformanceFee, fndzInvestmentFee.address],
        [encodedPerformanceFeeParams, encodedFNDZInvestmentFeeParams],
      ],
    );

    const createVaultTx = await fndzController.createNewFund(
      deployer.address,
      'Test Vault With Fee',
      contracts.mockTokens.MockBUSD,
      '1',
      encodeFeeConfig,
      emptyConfigData,
    );
    const response = await createVaultTx.wait();
    ({ comptrollerProxy, vaultProxy } = await getFundAddresses(response));

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    comptrollerLib = ComptrollerLib.attach(comptrollerProxy);

    const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
    vaultLib = VaultLib.attach(vaultProxy);
    /// Vault creation end

    // approving busd token
    await busdToken.approve(comptrollerLib.address, utils.parseEther('100'));

    await comptrollerLib.buyShares(utils.parseEther('10'), 0, ethers.constants.AddressZero);
    let lockedAmount = await fndzInvestmentRegistry.getLockedAmount(vaultLib.address);
    expect(lockedAmount).to.equal(await fndzToken.balanceOf(vaultLib.address));
    const prevLockedAmount = lockedAmount;

    // Buying FNDZ token through trading
    samplePathV5[0][0] = contracts.mockTokens.MockUSDC;
    const incomingAmount = utils.parseEther('10');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      utils.parseEther('1'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptrollerLib.callOnExtension(contracts.IntegrationManager, 0, encodedTradeData);

    // Advancing the Time to complete the crystallization period
    await advanceTime(crystallizationPeriod + 1);

    // Pay out Performance fee to settle the fee
    const payoutTx = await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(
      comptrollerLib.address,
      [contracts.PerformanceFee],
    );
    const payoutReceipt = await payoutTx.wait();

    const lockedBalanceUpdatedEvents = filterEventsByABI(payoutReceipt, [LockedAmountUpdatedEventABI]);
    expect(lockedBalanceUpdatedEvents.length).to.equal(1);
    expect(lockedBalanceUpdatedEvents[0].args.comptrollerProxy).to.equal(comptrollerProxy);
    expect(lockedBalanceUpdatedEvents[0].args.oldBalance).to.equal(prevLockedAmount);

    // FNDZ token transferred from vaultProxy to FNDZStakingPool and fndzDAO of FNDZ token when settling Management Fee
    const fndzTransferredToStaking = await fndzToken.balanceOf(fndzController.fndzStakingPool());
    const fndzTransferredToFndzDao = await fndzToken.balanceOf(fndzController.fndzDao());

    lockedAmount = await fndzInvestmentRegistry.getLockedAmount(vaultLib.address);
    expect(lockedAmount).to.equal(prevLockedAmount.sub(fndzTransferredToStaking.add(fndzTransferredToFndzDao)));
    expect(lockedBalanceUpdatedEvents[0].args.newBalance).to.equal(lockedAmount);
  });

  it('Should not settle fee if investmentDue is 0', async function () {
    const investmentAmount = BigNumber.from('1');
    const buyTx = await comptrollerLib.buyShares(investmentAmount, 0, ethers.constants.AddressZero);
    const buyReceipt = await buyTx.wait();
    const fndzInvestmentDue = investmentAmount.mul(utils.parseEther('0.01')).div(utils.parseEther('1'));
    expect(fndzInvestmentDue).to.equal(0);
    const settledEvents = filterEventsByABI(buyReceipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(0);
  });

  it('Can able to get the Fee info of the Fund', async function () {
    const feeInfo = await fndzInvestmentFee.getFeeInfoForFund(comptrollerLib.address);
    expect(feeInfo.rate).to.equal(utils.parseEther('0.01'));
    expect(feeInfo.balanceBeforeSettlement).to.equal(0);
  });
});

describe('FNDZ Invest Registry Test suite', function () {
  it('Only the owner can set the Fee address', async function () {
    const oldFee = await fndzInvestmentRegistry.feeAddress();

    const NewFNDZInvestmentFee = await hre.ethers.getContractFactory('FNDZInvestmentFee');
    const newFndzInvestmentFee = await NewFNDZInvestmentFee.deploy(
      contracts.FeeManager,
      contracts.mockTokens.MockFNDZ,
      fndzInvestmentRegistry.address,
    );
    await newFndzInvestmentFee.deployed();

    const setTx = await fndzInvestmentRegistry.setFeeAddress(newFndzInvestmentFee.address);
    const setReceipt = await setTx.wait();
    const feeSetEvents = filterEventsByABI(setReceipt, [FeeSetEventABI]);
    expect(feeSetEvents.length).to.equal(1);
    expect(feeSetEvents[0].args._old).to.equal(oldFee);
    expect(feeSetEvents[0].args._new).to.equal(newFndzInvestmentFee.address);

    await expect(
      fndzInvestmentRegistry.connect(accounts[1]).setFeeAddress(newFndzInvestmentFee.address),
    ).to.revertedWith('Ownable: caller is not the owner');
  });

  it('Fee Address can not be zero address or the existing one', async function () {
    await expect(fndzInvestmentRegistry.setFeeAddress(ethers.constants.AddressZero)).to.revertedWith(
      '_feeAddress can not be zero address',
    );
    const existingFeeAddress = await fndzInvestmentRegistry.feeAddress();
    await expect(fndzInvestmentRegistry.setFeeAddress(existingFeeAddress)).to.revertedWith('_feeAddress already set');
  });

  it('Only from the Fee contract alone can update the locked amount', async function () {
    await expect(fndzInvestmentRegistry.updateLockedAmount(vaultLib.address, utils.parseEther('1'))).to.revertedWith(
      'can only be called by the designated fee contract',
    );
  });

  it('can read the locked amount of the vault', async function () {
    await expect(fndzInvestmentRegistry.getLockedAmount(vaultLib.address)).to.be.not.reverted;
  });
});
