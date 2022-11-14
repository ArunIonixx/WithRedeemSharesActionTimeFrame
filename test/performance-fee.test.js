/* eslint-disable @typescript-eslint/no-var-requires */
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { deployments } = require('./utils/deploy-test-contracts.js');
const {
  emptyConfigData,
  filterEventsByABI,
  getFundAddresses,
  advanceTime,
  sharesRedeemedABI,
  transferABI,
  performanceFeeFundSettingsAddedEventABI,
  takeOrderABI,
  comptrollerProxyDeployedEventABI,
  paraSwapV5CallArgsEncodeType,
} = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let fndzController;
let fndzStaking;
let comptroller;
let vault;
let abiCoder;
let tradedAsset;
let denominationAsset;
let mockBUSD;
let mockDai;
let encodedTradeData;
let integrationManager;
let fundActionsWrapper;
let fndzStakingPool;
let fndzDao;
let performanceFee;
let samplePath;
let takeOrderInterface;
let fndzToken;

// shareUint represents the uint256 value of a single vault share with the appropriate number of zeros
const shareUint = utils.parseEther('1');
const performanceFeePercentage = utils.parseEther('0.1');
const crystallizationPeriod = 30 * 24 * 60 * 60; // Monthly in seconds
const performanceUpdateEventABI =
  'event PerformanceUpdated(address indexed comptrollerProxy, uint256 prevAggregateValueDue, uint256 nextAggregateValueDue, int256 sharesOutstandingDiff)';
const lastSharePriceUpdatedEventABI =
  'event LastSharePriceUpdated(address indexed comptrollerProxy,uint256 prevSharePrice,uint256 nextSharePrice)';

beforeEach(async function () {
  // runs before each test in this block
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  abiCoder = new utils.AbiCoder();

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contracts.FNDZController);

  const FNDZStaking = await ethers.getContractFactory('FNDZStaking', deployer);
  fndzStaking = FNDZStaking.attach(contracts.FNDZStaking);

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  mockBUSD = MockToken.attach(contracts.mockTokens.MockBUSD);
  expect(mockBUSD).to.be.an('object');

  mockDai = MockToken.attach(contracts.mockTokens.MockDai);
  expect(mockDai).to.be.an('object');

  fndzToken = MockToken.attach(contracts.mockTokens.MockFNDZ);
  expect(fndzToken).to.be.an('object');

  await mockBUSD.mintFor(accounts[1].address, utils.parseEther('10000'));
  await mockBUSD.mintFor(accounts[2].address, utils.parseEther('10000'));

  const IntegrationManager = await ethers.getContractFactory('IntegrationManager', deployer);
  integrationManager = IntegrationManager.attach(contracts.IntegrationManager);
  expect(integrationManager).to.be.an('object');

  const FundActionsWrapper = await ethers.getContractFactory('FundActionsWrapper', deployer);
  fundActionsWrapper = FundActionsWrapper.attach(contracts.FundActionsWrapper);
  expect(fundActionsWrapper).to.be.an('object');

  const PerformanceFee = await ethers.getContractFactory('PerformanceFee', deployer);
  performanceFee = PerformanceFee.attach(contracts.PerformanceFee);
  expect(performanceFee).to.be.an('object');

  fndzStakingPool = await fndzController.fndzStakingPool();
  fndzDao = await fndzController.fndzDao();

  denominationAsset = mockBUSD;
  tradedAsset = mockDai;
  takeOrderInterface = new utils.Interface([takeOrderABI]);
  samplePath = [
    [
      tradedAsset.address,
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
  encodedTradeData = abiCoder.encode(
    ['address', 'bytes4', 'bytes'],
    [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
  );
});

describe('Performance Fee Test Cases (Vault Setup)', function () {
  it('Should be able to create a vault with Performance fee (10%) and fetch fee info', async function () {
    const performanceFeePercentage = utils.parseEther('0.1');
    const abiCoder = new ethers.utils.AbiCoder();
    const encodedFeeParams = abiCoder.encode(['uint', 'uint'], [performanceFeePercentage, crystallizationPeriod]);
    const encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[contracts.PerformanceFee], [encodedFeeParams]]);

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'Performance Fee Test',
      denominationAsset.address,
      '1',
      encodedFeeData,
      emptyConfigData,
    );
    const newFundReceipt = await newFundTx.wait();

    const { comptrollerProxy } = getFundAddresses(newFundReceipt);
    const fundSettingsAddedEvents = filterEventsByABI(newFundReceipt, [performanceFeeFundSettingsAddedEventABI]);
    expect(fundSettingsAddedEvents.length).to.equal(1);
    const eventArgs = fundSettingsAddedEvents[0].args;
    expect(eventArgs.comptrollerProxy).to.equal(comptrollerProxy);
    expect(eventArgs.rate).to.equal(performanceFeePercentage);
    expect(eventArgs.period).to.equal(crystallizationPeriod);

    // Verifying the getFeeInfoForFund
    const feeInfo = await performanceFee.getFeeInfoForFund(comptrollerProxy);
    expect(feeInfo.rate).to.be.equal(performanceFeePercentage);
    expect(feeInfo.period).to.be.equal(crystallizationPeriod);
  });

  it('Revert if Fee percentage is not within 0% - 30%', async function () {
    var performanceFeePercentage = utils.parseEther('0');
    var encodedFeeParams = abiCoder.encode(['uint', 'uint'], [performanceFeePercentage, crystallizationPeriod]);
    var encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[contracts.PerformanceFee], [encodedFeeParams]]);

    await expect(
      fndzController.createNewFund(
        deployer.address,
        'Performance Fee Test',
        denominationAsset.address,
        '1',
        encodedFeeData,
        emptyConfigData,
      ),
    ).to.be.revertedWith('addFundSettings: feeRate must be greater than 0');

    performanceFeePercentage = utils.parseEther('0.3').add(1);
    encodedFeeParams = abiCoder.encode(['uint', 'uint'], [performanceFeePercentage, crystallizationPeriod]);
    encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[contracts.PerformanceFee], [encodedFeeParams]]);

    await expect(
      fndzController.createNewFund(
        deployer.address,
        'Performance Fee Test',
        denominationAsset.address,
        '1',
        encodedFeeData,
        emptyConfigData,
      ),
    ).to.be.revertedWith('createNewFund: fee parameter value is not within the acceptable range');
  });

  it('Revert if Crystallization period is not within minimum of one week to maximum of quarterly', async function () {
    const performanceFeePercentage = utils.parseEther('0.1');
    var crystallizationPeriod = 7 * 24 * 60 * 60 - 1; // Having 1 second less in 7 Days
    var encodedFeeParams = abiCoder.encode(['uint', 'uint'], [performanceFeePercentage, crystallizationPeriod]);
    var encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[contracts.PerformanceFee], [encodedFeeParams]]);

    await expect(
      fndzController.createNewFund(
        deployer.address,
        'Performance Fee Test',
        denominationAsset.address,
        '1',
        encodedFeeData,
        emptyConfigData,
      ),
    ).to.be.revertedWith('createNewFund: fee parameter value is not within the acceptable range');

    crystallizationPeriod = 92 * 24 * 60 * 60; // Having 92 days
    encodedFeeParams = abiCoder.encode(['uint', 'uint'], [performanceFeePercentage, crystallizationPeriod]);
    encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[contracts.PerformanceFee], [encodedFeeParams]]);

    await expect(
      fndzController.createNewFund(
        deployer.address,
        'Performance Fee Test',
        denominationAsset.address,
        '1',
        encodedFeeData,
        emptyConfigData,
      ),
    ).to.be.revertedWith('createNewFund: fee parameter value is not within the acceptable range');
  });
});

describe('Performance Fee Test Cases (FNDZ DAO Desired Currency == Denomination Asset)', function () {
  beforeEach(async function () {
    // Creating a Vault with 10% of performance fee
    const abiCoder = new ethers.utils.AbiCoder();
    const encodedFeeParams = abiCoder.encode(['uint', 'uint'], [performanceFeePercentage, crystallizationPeriod]);
    const encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[contracts.PerformanceFee], [encodedFeeParams]]);

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'Performance Fee Test',
      denominationAsset.address,
      '1',
      encodedFeeData,
      emptyConfigData,
    );
    const newFundReceipt = await newFundTx.wait();

    const { comptrollerProxy, vaultProxy } = getFundAddresses(newFundReceipt);

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    comptroller = ComptrollerLib.attach(comptrollerProxy);
    expect(comptroller).to.be.an('object');

    const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
    vault = VaultLib.attach(vaultProxy);
    expect(vault).to.be.an('object');

    // Depositing 50 tokens
    const investor = accounts[1];
    const depositAmount = utils.parseEther('50');
    await denominationAsset.connect(investor).approve(comptroller.address, depositAmount);
    await comptroller.connect(investor).buyShares(depositAmount, 0, ethers.constants.AddressZero);
  });

  it('Performance fee should be updated (mint/burn) on next deposit/withdraw after traded', async function () {
    const investor = accounts[1];
    // Trading Assets
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Depositing after a trade
    const depositAmount = utils.parseEther('10');
    await denominationAsset.connect(investor).approve(comptroller.address, depositAmount);
    const buySharesTx = await comptroller.connect(investor).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    const buySharesReceipt = await buySharesTx.wait();

    let performanceEvents = filterEventsByABI(buySharesReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);
    let event = performanceEvents[0].args;
    expect(event.comptrollerProxy).to.equal(comptroller.address);
    let sharesOutstanding = await vault.balanceOf(vault.address);
    expect(event.sharesOutstandingDiff).to.equal(sharesOutstanding);

    // Trading Assets
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Redeeming Shares to verify the Performance update after trade on withdraw
    const redeemTx = await comptroller.connect(investor).redeemSharesDetailed(utils.parseEther('10'), [], []);
    const redeemReceipt = await redeemTx.wait();
    performanceEvents = filterEventsByABI(redeemReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);
    sharesOutstanding = await vault.balanceOf(vault.address);

    // Verify the burning of mint shares
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      utils.parseEther('2'),
      utils.parseEther('2'),
      denominationAsset.address,
      utils.parseEther('10'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePath,
    ]);
    const encodedData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    // Trading for low price
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedData);

    // Invoking Continuous hook to update performance
    const invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    const invokeReceipt = await invokeTx.wait();
    performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);
    event = performanceEvents[0].args;
    expect(event.comptrollerProxy).to.equal(comptroller.address);
    expect(event.sharesOutstandingDiff).to.equal(BigNumber.from('-487015856880838208'));
    const currentSharesOutstanding = await vault.balanceOf(vault.address);
    expect(sharesOutstanding.add(event.sharesOutstandingDiff)).to.equal(currentSharesOutstanding);
  });

  it('Performance Should not be updated if totalSharesSupply = 0 or totalSharesSupply == sharesOutstanding', async function () {
    const investor = accounts[1];
    await comptroller.connect(investor).redeemSharesDetailed(0, [], []);

    // @case - totalSharesSupply == 0
    expect(await vault.totalSupply()).to.equal(0);

    // Air Dropping 1 DAI to skip _gav == 0
    await denominationAsset.transfer(vault.address, utils.parseEther('1'));
    // Invoking Continuous hook to update performance
    let invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    let invokeReceipt = await invokeTx.wait();
    let performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(0);

    // Buying Shares
    const depositAmount = utils.parseEther('50');
    await denominationAsset.connect(investor).approve(comptroller.address, depositAmount);
    await comptroller.connect(investor).buyShares(depositAmount, 0, ethers.constants.AddressZero);

    // Trading the denomination asset
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Redeeming all the shares
    await comptroller.connect(investor).redeemSharesDetailed(0, [], []);

    // @case - totalSharesSupply == sharesOutstanding
    expect(await vault.totalSupply()).to.equal(BigNumber.from('833333333333333333'));
    expect(await vault.totalSupply()).to.equal(await vault.balanceOf(vault.address));

    // Invoking Continuous hook to update performance
    invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    invokeReceipt = await invokeTx.wait();
    performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(0);
  });

  it('Outstanding Shares should not be paid out until the Crystallization period ends', async function () {
    // Trading the denomination asset
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Triggering Payout Before crystallization period
    const payoutTx = await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(
      comptroller.address,
      [contracts.PerformanceFee],
    );
    const payoutReceipt = await payoutTx.wait();

    // Filtering out the MintOutstandingShares event
    // Payout will not happen because of Crystallization period.
    // There should be only one tranfer event of Mint Outstanding shares
    const transferEvents = filterEventsByABI(payoutReceipt, [transferABI]);
    expect(transferEvents.length).to.equal(1);
    const outStandingSharesMintEvents = transferEvents.filter(
      (event) => event.args.from == ethers.constants.AddressZero && event.args.to == vault.address,
    );
    expect(outStandingSharesMintEvents.length).to.equal(1);
    const sharesOutstanding = outStandingSharesMintEvents[0].args.value;

    // Verifying whether the outstanding shares were not redeemed
    expect(await vault.balanceOf(vault.address)).to.equal(sharesOutstanding);
    expect(await vault.balanceOf(deployer.address)).to.equal(0);
    expect(await denominationAsset.balanceOf(fndzStakingPool)).to.equal(0);
    expect(await denominationAsset.balanceOf(fndzDao)).to.equal(0);

    // Advancing the time to complete the crystallization period for payout
    await advanceTime(crystallizationPeriod);

    // Triggering Payout
    await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(comptroller.address, [
      contracts.PerformanceFee,
    ]);
    // Verifying whether the outstanding shares were redeemed
    expect(await vault.balanceOf(vault.address)).to.equal(0);
    expect(await vault.balanceOf(deployer.address)).to.equal(BigNumber.from('423728813559322033'));
    expect(await denominationAsset.balanceOf(fndzStakingPool)).to.equal(BigNumber.from('166666666666666665'));
    expect(await denominationAsset.balanceOf(fndzDao)).to.equal(BigNumber.from('166666666666666667'));
  });

  it('Payout should redeem all the outstanding shares, including unpaid shares from a previous period', async function () {
    const investor = accounts[1];
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Depositing to trigger the Performance fee update
    const depositAmount = utils.parseEther('10');
    await denominationAsset.connect(investor).approve(comptroller.address, depositAmount);
    var buySharesTx = await comptroller.connect(investor).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    var buySharesReceipt = await buySharesTx.wait();

    var performanceEvents = filterEventsByABI(buySharesReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);

    const sharesOutstanding = await vault.balanceOf(vault.address);

    // Advancing the time to complete the crystallization
    await advanceTime(crystallizationPeriod);

    // Trading to improve the performance
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Depositing to Trigger the Performance Fee update
    await denominationAsset.connect(investor).approve(comptroller.address, depositAmount);
    buySharesTx = await comptroller.connect(investor).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    buySharesReceipt = await buySharesTx.wait();

    performanceEvents = filterEventsByABI(buySharesReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);

    const currentSharesOutstanding = await vault.balanceOf(vault.address);
    expect(currentSharesOutstanding).to.not.equal(sharesOutstanding);

    // Advancing the time to complete the crystallization period for payout
    await advanceTime(crystallizationPeriod);

    // Triggering Payout
    await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(comptroller.address, [
      contracts.PerformanceFee,
    ]);
    // Verifying whether all the outstanding shares were redeemed
    expect(await vault.balanceOf(vault.address)).to.equal(0);
  });

  it('Payout should redeem all the outstanding shares, including newly minted shares after the previous period', async function () {
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Invoking Continuous Hook to trigger the Performance fee update
    var invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    var invokeReceipt = await invokeTx.wait();

    var performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);
    var performanceEvent = performanceEvents[0].args;
    var sharesOutstandingDiff = performanceEvent.sharesOutstandingDiff;

    const firstSharesOutstanding = await vault.balanceOf(vault.address);
    expect(sharesOutstandingDiff.gt(0)).to.be.true;
    expect(sharesOutstandingDiff).to.equal(firstSharesOutstanding);

    // Advancing the time to complete the crystallization
    await advanceTime(crystallizationPeriod);

    // Trading to improve the performance
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Invoking Continuous Hook to trigger the Performance fee update
    invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    invokeReceipt = await invokeTx.wait();

    performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);
    performanceEvent = performanceEvents[0].args;
    sharesOutstandingDiff = performanceEvent.sharesOutstandingDiff;

    const secondSharesOutstanding = await vault.balanceOf(vault.address);
    expect(sharesOutstandingDiff.gt(0)).to.be.true;
    expect(sharesOutstandingDiff.add(firstSharesOutstanding)).to.equal(secondSharesOutstanding);

    // Triggering Payout
    await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(comptroller.address, [
      contracts.PerformanceFee,
    ]);

    const performanceFeeSplits = await fndzController.getPerformanceFeeData(deployer.address);
    const vaultOwnerSplit = performanceFeeSplits[2];
    // Verifying whether all the outstanding shares were redeemed
    expect(await vault.balanceOf(vault.address)).to.equal(0);
    expect(await vault.balanceOf(deployer.address)).to.equal(
      secondSharesOutstanding.mul(vaultOwnerSplit).div(performanceFeeSplits[4]),
    );
  });

  it('Payout should redeem all the outstanding shares, including the burned shares after the previous period', async function () {
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Invoking Continuous Hook to trigger the Performance fee update
    var invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    var invokeReceipt = await invokeTx.wait();

    var performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);
    var performanceEvent = performanceEvents[0].args;
    var sharesOutstandingDiff = performanceEvent.sharesOutstandingDiff;

    const firstSharesOutstanding = await vault.balanceOf(vault.address);
    expect(sharesOutstandingDiff.gt(0)).to.be.true;
    expect(sharesOutstandingDiff).to.equal(firstSharesOutstanding);

    // Advancing the time to complete the crystallization
    await advanceTime(crystallizationPeriod);

    // Trading for the low price to burn the performance Fee
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      utils.parseEther('2'),
      utils.parseEther('2'),
      denominationAsset.address,
      utils.parseEther('10'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePath,
    ]);
    const tradeEncodedData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), tradeEncodedData);

    // Invoking Continuous Hook to trigger the Performance fee update
    invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    invokeReceipt = await invokeTx.wait();

    performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);
    performanceEvent = performanceEvents[0].args;
    sharesOutstandingDiff = performanceEvent.sharesOutstandingDiff;

    const secondSharesOutstanding = await vault.balanceOf(vault.address);
    expect(sharesOutstandingDiff.lt(0)).to.be.true;
    expect(sharesOutstandingDiff.add(firstSharesOutstanding)).to.equal(secondSharesOutstanding);

    // Triggering Payout
    await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(comptroller.address, [
      contracts.PerformanceFee,
    ]);

    const performanceFeeSplits = await fndzController.getPerformanceFeeData(deployer.address);
    const vaultOwnerSplit = performanceFeeSplits[2];
    // Verifying whether all the outstanding shares were redeemed
    expect(await vault.balanceOf(vault.address)).to.equal(0);
    expect(await vault.balanceOf(deployer.address)).to.equal(
      secondSharesOutstanding.mul(vaultOwnerSplit).div(performanceFeeSplits[4]),
    );
  });

  it('Payout should split the performance fee to the owner, staking pool, and dao', async function () {
    // Trading the denomination asset
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Advancing the time to complete the crystallization period for payout
    await advanceTime(crystallizationPeriod);

    const payoutTx = await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(
      comptroller.address,
      [contracts.PerformanceFee],
    );
    const payoutReceipt = await payoutTx.wait();

    const trackedAssets = await vault.getTrackedAssets();
    // ComptrollerLib SharesRedeemed event
    const sharesRedeemedEvents = filterEventsByABI(payoutReceipt, [sharesRedeemedABI]);
    expect(sharesRedeemedEvents.length).to.equal(2);

    // VaultLib (and token) Transfer events
    // Total Transfer Events
    // Mint Outstanding shares - 1
    // Transfer Vault owner split - 1
    // Burn while redeem for staking and fndzDao - 2
    // Assets transfer to staking - transackedAsset Count (2)
    // Assets tranfer to fndzDao - trackedAsset Count (2)
    const transferEvents = filterEventsByABI(payoutReceipt, [transferABI]);
    expect(transferEvents.length).to.equal(8);

    const outStandingSharesMintEvents = transferEvents.filter(
      (event) => event.args.from == ethers.constants.AddressZero && event.args.to == vault.address,
    );
    expect(outStandingSharesMintEvents.length).to.equal(1);
    const sharesOutstanding = outStandingSharesMintEvents[0].args.value;

    // Transfer for vault owner
    const ownerShareTransferEvents = transferEvents.filter(
      (event) => event.args.from === vault.address && event.args.to === deployer.address,
    );
    expect(ownerShareTransferEvents.length).to.equal(1);
    const sharesTransferredToVaultOwner = ownerShareTransferEvents[0].args.value;

    // Verify whether the vault owner received the correct split value
    const performanceData = await fndzController.getPerformanceFeeData(deployer.address);
    expect(sharesTransferredToVaultOwner).to.equal(sharesOutstanding.mul(performanceData[2]).div(performanceData[4]));

    // Transfer events of the Tracked assets being sent to staking and dao
    // Count -> Tracked Assets * (1 fndzDao + 1 Staking)
    const trackedAssetsTransferEvents = transferEvents.filter(
      (event) =>
        event.args.from === vault.address &&
        event.args.to != deployer.address &&
        event.args.to != ethers.constants.AddressZero,
    );
    expect(trackedAssetsTransferEvents.length).to.equal(trackedAssets.length * 2);

    // Total number of virtual shares
    const totalVirtualSharesRedeemed = sharesRedeemedEvents.reduce((total, currentEvent) => {
      if (currentEvent.args.isVirtual) {
        total = total.add(currentEvent.args.sharesQuantity);
      }
      return total;
    }, BigNumber.from('0'));

    expect(sharesTransferredToVaultOwner.add(totalVirtualSharesRedeemed)).to.equal(sharesOutstanding);

    // Check that denomination asset Transfer events correspond with ComptrollerLib SharesRedeemed events
    for (let i = 0; i < sharesRedeemedEvents.length; i += 1) {
      expect(sharesRedeemedEvents[i].args.receivedAssets.length).to.equal(trackedAssets.length);
      expect(sharesRedeemedEvents[i].args.receivedAssetQuantities.length).to.equal(trackedAssets.length);
      expect(trackedAssets).to.eql(sharesRedeemedEvents[i].args.receivedAssets);
      expect(sharesRedeemedEvents[i].args.isVirtual).to.equal(true);
    }

    const sharesTotalSupply = await vault.totalSupply();
    const vaultOwnerShares = await vault.balanceOf(deployer.address);
    const vaultDenominationAssetsBalance = await denominationAsset.balanceOf(vault.address);
    const vaultTradedAssetBalance = await tradedAsset.balanceOf(vault.address);
    const fndzStakingDenominationAssetsBalance = await denominationAsset.balanceOf(fndzStakingPool);
    const fndzStakingTradedAssetBalance = await tradedAsset.balanceOf(fndzStakingPool);
    const fndzDaoDenominationAssetsBalance = await denominationAsset.balanceOf(fndzDao);
    const fndzDaoTradedAssetBalance = await tradedAsset.balanceOf(fndzDao);

    expect(vaultOwnerShares / sharesTotalSupply).to.equal(0.008403361344537815);
    expect(fndzStakingDenominationAssetsBalance / vaultDenominationAssetsBalance).to.equal(0.004201680672268907);
    expect(fndzStakingTradedAssetBalance / vaultTradedAssetBalance).to.equal(0.004201680672268907);
    expect(fndzDaoDenominationAssetsBalance / vaultDenominationAssetsBalance).to.equal(0.004201680672268907);
    expect(fndzDaoTradedAssetBalance / vaultTradedAssetBalance).to.equal(0.004201680672268907);

    // Checking the stake and fndz dao balances
    expect((await denominationAsset.balanceOf(fndzStakingPool)).gt(0)).to.be.true;
    expect((await tradedAsset.balanceOf(fndzStakingPool)).gt(0)).to.be.true;
    // Due to the empty pairs in uniswap the tracked assets directly sent to the fndzDao
    expect((await denominationAsset.balanceOf(fndzDao)).gt(0)).to.be.true;
    expect((await tradedAsset.balanceOf(fndzDao)).gt(0)).to.be.true;
  });

  it("Withdrawing shares before the crystallization period won't affect performance obtained", async function () {
    const investor = accounts[1];
    const performanceFeeSplits = await fndzController.getPerformanceFeeData(deployer.address);
    const rateDivisor = performanceFeeSplits[4];

    // Depositing +50 tokens
    const depositAmount = utils.parseEther('50');
    await denominationAsset.connect(investor).approve(comptroller.address, depositAmount);
    await comptroller.connect(investor).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    expect(await vault.balanceOf(investor.address)).to.equal(utils.parseEther('100'));

    var totalSupply = await vault.totalSupply();
    // Calculating the Gross Asset Value
    var busdBalance = await mockBUSD.balanceOf(vault.address);
    var daiBalance = await mockDai.balanceOf(vault.address);
    // Since the current rate of all the assets is one
    // we can assume the assets' balance as gav
    var gavBeforeTrade = busdBalance.add(daiBalance);
    var currentSharePrice = gavBeforeTrade.mul(shareUint).div(totalSupply);
    expect(currentSharePrice).to.equal(BigNumber.from('1000000000000000000'));
    var highWaterMark = currentSharePrice;

    // Trading the 100 denomination asset to 200 traded Asset
    var encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      utils.parseEther('200'),
      utils.parseEther('200'),
      denominationAsset.address,
      utils.parseEther('100'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePath,
    ]);
    var tradeDataEncoded = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), tradeDataEncoded);

    totalSupply = await vault.totalSupply();
    // Calculating the Gross Asset Value
    busdBalance = await mockBUSD.balanceOf(vault.address);
    daiBalance = await mockDai.balanceOf(vault.address);
    // Since the current rate of all the assets is one
    // we can assume the assets' balance as gav
    const gavAfterTrade = busdBalance.add(daiBalance);
    var prevSharePrice = currentSharePrice;
    currentSharePrice = gavAfterTrade.mul(shareUint).div(totalSupply);
    expect(currentSharePrice).to.equal(BigNumber.from('2000000000000000000'));
    expect(currentSharePrice.gt(highWaterMark)).to.be.true;
    var profit = currentSharePrice.sub(highWaterMark).mul(totalSupply).div(shareUint);
    expect(profit).to.equal(BigNumber.from('100000000000000000000'));
    var expectedPerformanceFee = profit.mul(performanceFeePercentage).div(rateDivisor);
    expect(expectedPerformanceFee).to.equal(BigNumber.from('10000000000000000000'));

    // invoking continuous hook to update performance
    var invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    var invokeReceipt = await invokeTx.wait();

    const performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);
    const performanceUpdateEvent = performanceEvents[0].args;
    var sharesOutstanding = await vault.balanceOf(vault.address);
    expect(performanceUpdateEvent.sharesOutstandingDiff).to.equal(sharesOutstanding);

    const lastSharePriceUpdatedEvents = filterEventsByABI(invokeReceipt, [lastSharePriceUpdatedEventABI]);
    expect(lastSharePriceUpdatedEvents.length).to.equal(1);
    const lastSharePriceUpdatedEvent = lastSharePriceUpdatedEvents[0].args;
    expect(lastSharePriceUpdatedEvent.prevSharePrice).to.equal(prevSharePrice);
    expect(lastSharePriceUpdatedEvent.nextSharePrice).to.equal(currentSharePrice);

    // Investor withdraws all the shares
    await comptroller.connect(investor).redeemSharesDetailed(0, [], []);
    expect(await vault.balanceOf(investor.address)).to.equal(0);

    // Verifying the shares owed for performance
    const totalSupplyBeforeRedeem = totalSupply.add(performanceUpdateEvent.sharesOutstandingDiff);
    var performanceFeeObtained = sharesOutstanding.mul(gavAfterTrade).div(totalSupplyBeforeRedeem);
    expect(sharesOutstanding).to.equal(BigNumber.from('5263157894736842105'));
    expect(performanceFeeObtained.sub(expectedPerformanceFee)).to.be.above(-5).below(5);

    // Advancing the time to complete the crystallization period for payout
    await advanceTime(crystallizationPeriod);

    // Verifying the shares owed for performance
    expect(await vault.balanceOf(vault.address)).to.equal(sharesOutstanding);
  });

  it('Verifying the high water mark works as expected', async function () {
    const performanceFeeSplits = await fndzController.getPerformanceFeeData(deployer.address);
    const rateDivisor = performanceFeeSplits[4];

    // Depositing +50 tokens
    const investor = accounts[1];
    const depositAmount = utils.parseEther('50');
    await denominationAsset.connect(investor).approve(comptroller.address, depositAmount);
    await comptroller.connect(investor).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    expect(await vault.balanceOf(investor.address)).to.equal(utils.parseEther('100'));

    var totalSupply = await vault.totalSupply();
    // Calculating the Gross Asset Value
    var busdBalance = await mockBUSD.balanceOf(vault.address);
    var daiBalance = await mockDai.balanceOf(vault.address);
    // Since the current rate of all the assets is one
    // we can assume the assets' balance as gav
    var gavBeforeTrade = busdBalance.add(daiBalance);
    var currentSharePrice = gavBeforeTrade.mul(shareUint).div(totalSupply);
    var highWaterMark = currentSharePrice;

    /// Case 1 - Increasing the vault value (100 -> 200)
    // Trading the 100 denomination asset to 200 traded Asset
    var encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      utils.parseEther('200'),
      utils.parseEther('200'),
      denominationAsset.address,
      utils.parseEther('100'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePath,
    ]);
    var tradeDataEncoded = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), tradeDataEncoded);

    totalSupply = await vault.totalSupply();
    // Calculating the Gross Asset Value
    busdBalance = await mockBUSD.balanceOf(vault.address);
    daiBalance = await mockDai.balanceOf(vault.address);
    // Since the current rate of all the assets is one
    // we can assume the assets' balance as gav
    const gavAfterTradeCase1 = busdBalance.add(daiBalance);
    var prevSharePrice = currentSharePrice;
    currentSharePrice = gavAfterTradeCase1.mul(shareUint).div(totalSupply);
    expect(currentSharePrice.gt(highWaterMark)).to.be.true;
    var profit = currentSharePrice.sub(highWaterMark).mul(totalSupply).div(shareUint);
    expect(profit).to.equal(BigNumber.from('100000000000000000000'));
    var expectedPerformanceFee = profit.mul(performanceFeePercentage).div(rateDivisor);
    expect(expectedPerformanceFee).to.equal(BigNumber.from('10000000000000000000'));

    // updating the high water mark
    highWaterMark = currentSharePrice;

    // Advancing the time to complete the crystallization period for payout
    await advanceTime(crystallizationPeriod);

    // invoking continuous hook to update performance
    var invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    var invokeReceipt = await invokeTx.wait();

    var performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);
    var performanceUpdateEvent = performanceEvents[0].args;

    var lastSharePriceUpdatedEvents = filterEventsByABI(invokeReceipt, [lastSharePriceUpdatedEventABI]);
    expect(lastSharePriceUpdatedEvents.length).to.equal(1);
    var lastSharePriceUpdatedEvent = lastSharePriceUpdatedEvents[0].args;
    expect(lastSharePriceUpdatedEvent.prevSharePrice).to.equal(prevSharePrice);
    expect(lastSharePriceUpdatedEvent.nextSharePrice).to.equal(currentSharePrice);

    // Verifying the shares owed for performance
    const sharesOutstandingCase1 = await vault.balanceOf(vault.address);
    totalSupply = await vault.totalSupply();
    var performanceFeeObtained = sharesOutstandingCase1.mul(gavAfterTradeCase1).div(totalSupply);
    expect(sharesOutstandingCase1).to.equal(BigNumber.from('5263157894736842105'));
    expect(performanceFeeObtained.sub(expectedPerformanceFee)).to.be.above(-5).below(5);

    // Initiating payout to redeem outstanding shares
    await comptroller.callOnExtension(
      contracts.FeeManager,
      1,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    expect(await vault.balanceOf(vault.address)).to.equal(0);
    // Also redeeming the owner shares to ease the sharePrice calculation
    await comptroller.redeemSharesDetailed(0, [], []);

    // Calculating current shareprice again because of payout
    // assets should be withdrawn to staking and dao
    totalSupply = await vault.totalSupply();
    // Calculating the Gross Asset Value
    busdBalance = await mockBUSD.balanceOf(vault.address);
    daiBalance = await mockDai.balanceOf(vault.address);
    // Since the current rate of all the assets is one
    // we can assume the assets' balance as gav
    const gavAfterPayoutCase1 = busdBalance.add(daiBalance);
    prevSharePrice = currentSharePrice;
    currentSharePrice = gavAfterPayoutCase1.mul(shareUint).div(totalSupply);

    // Case 2 - Decreasing the vault value (200 -> 150)
    // Trading 100 traded asset for 50 denomination asset
    var tradedToDenominationPath = [
      [
        denominationAsset.address,
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
    encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      utils.parseEther('50'),
      utils.parseEther('50'),
      tradedAsset.address,
      utils.parseEther('100'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      tradedToDenominationPath,
    ]);
    tradeDataEncoded = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), tradeDataEncoded);

    // Advancing the time to complete the crystallization period for payout
    await advanceTime(crystallizationPeriod);

    // Calculating the Gross Asset Value
    busdBalance = await mockBUSD.balanceOf(vault.address);
    daiBalance = await mockDai.balanceOf(vault.address);
    // Since the current rate of all the assets is one
    // we can assume the assets' balance as gav
    const gavAfterTradeCase2 = busdBalance.add(daiBalance);
    prevSharePrice = currentSharePrice;
    currentSharePrice = gavAfterTradeCase2.mul(shareUint).div(await vault.totalSupply());
    expect(currentSharePrice.lt(highWaterMark)).to.be.true;

    // invoking continuous hook to update performance
    invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    invokeReceipt = await invokeTx.wait();

    lastSharePriceUpdatedEvents = filterEventsByABI(invokeReceipt, [lastSharePriceUpdatedEventABI]);
    expect(lastSharePriceUpdatedEvents.length).to.equal(1);
    lastSharePriceUpdatedEvent = lastSharePriceUpdatedEvents[0].args;
    expect(lastSharePriceUpdatedEvent.prevSharePrice).to.equal(prevSharePrice);
    expect(lastSharePriceUpdatedEvent.nextSharePrice).to.equal(currentSharePrice);

    // Performance update events has to be 0 becuase current gav less than high water mark
    performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(0);

    /// Case 3 - Increasing the vault value back highWaterMark (150 -> 200)
    // Trading the available denomination asset to traded Asset to match highWaterMark
    var requiredBalance = utils.parseEther('200').sub(daiBalance);
    encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      requiredBalance,
      requiredBalance,
      denominationAsset.address,
      busdBalance,
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePath,
    ]);
    tradeDataEncoded = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), tradeDataEncoded);

    // Advancing the time to complete the crystallization period for payout
    await advanceTime(crystallizationPeriod);

    // Calculating the Gross Asset Value
    busdBalance = await mockBUSD.balanceOf(vault.address);
    daiBalance = await mockDai.balanceOf(vault.address);
    // Since the current rate of all the assets is one
    // we can assume the assets' balance as gav
    const gavAfterTradeCase3 = busdBalance.add(daiBalance);
    prevSharePrice = currentSharePrice;
    currentSharePrice = gavAfterTradeCase3.mul(shareUint).div(await vault.totalSupply());
    expect(currentSharePrice).to.equal(highWaterMark);
    expect(gavAfterTradeCase3).to.equal(utils.parseEther('200'));

    // invoking continuous hook to update performance
    invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    invokeReceipt = await invokeTx.wait();

    lastSharePriceUpdatedEvents = filterEventsByABI(invokeReceipt, [lastSharePriceUpdatedEventABI]);
    expect(lastSharePriceUpdatedEvents.length).to.equal(1);
    lastSharePriceUpdatedEvent = lastSharePriceUpdatedEvents[0].args;
    expect(lastSharePriceUpdatedEvent.prevSharePrice).to.equal(prevSharePrice);
    expect(lastSharePriceUpdatedEvent.nextSharePrice).to.equal(currentSharePrice);

    // Performance update has to be 0 because current gav is equal to highWaterMark
    performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(0);

    // Case 4 - Increasing the vault value above the highWaterMark (200 -> 250)
    // Trading traded asset to denomination asset to reach gav of 250
    encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      utils.parseEther('250'),
      utils.parseEther('250'),
      tradedAsset.address,
      await tradedAsset.balanceOf(vault.address),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      tradedToDenominationPath,
    ]);
    tradeDataEncoded = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), tradeDataEncoded);

    totalSupply = await vault.totalSupply();
    // Calculating the Gross Asset Value
    var busdBalance = await mockBUSD.balanceOf(vault.address);
    var daiBalance = await mockDai.balanceOf(vault.address);
    // Since the current rate of all the assets is one
    // we can assume the assets' balance as gav
    var gavAfterTradeCase4 = busdBalance.add(daiBalance);
    expect(gavAfterTradeCase4).to.equal(utils.parseEther('250'));
    prevSharePrice = currentSharePrice;
    currentSharePrice = gavAfterTradeCase4.mul(shareUint).div(totalSupply);
    expect(currentSharePrice.gt(highWaterMark)).to.be.true;

    profit = currentSharePrice.sub(highWaterMark).mul(totalSupply).div(shareUint);
    expect(profit).to.equal(BigNumber.from('50000000000000000000'));
    expectedPerformanceFee = profit.mul(performanceFeePercentage).div(rateDivisor);
    expect(expectedPerformanceFee).to.equal(BigNumber.from('5000000000000000000'));

    // Advancing the time to complete the crystallization period for payout
    await advanceTime(crystallizationPeriod);

    // invoking continuous hook to update performance
    invokeTx = await comptroller.callOnExtension(
      contracts.FeeManager,
      0,
      abiCoder.encode(['address[]'], [[contracts.PerformanceFee]]),
    );
    invokeReceipt = await invokeTx.wait();

    performanceEvents = filterEventsByABI(invokeReceipt, [performanceUpdateEventABI]);
    expect(performanceEvents.length).to.equal(1);
    performanceUpdateEvent = performanceEvents[0].args;

    lastSharePriceUpdatedEvents = filterEventsByABI(invokeReceipt, [lastSharePriceUpdatedEventABI]);
    expect(lastSharePriceUpdatedEvents.length).to.equal(1);
    lastSharePriceUpdatedEvent = lastSharePriceUpdatedEvents[0].args;
    expect(lastSharePriceUpdatedEvent.prevSharePrice).to.equal(prevSharePrice);
    expect(lastSharePriceUpdatedEvent.nextSharePrice).to.equal(currentSharePrice);

    // Verifying the shares owed for performance
    const sharesOutstandingCase4 = await vault.balanceOf(vault.address);
    totalSupply = await vault.totalSupply();
    performanceFeeObtained = performanceUpdateEvent.sharesOutstandingDiff.mul(gavAfterTradeCase4).div(totalSupply);
    expect(sharesOutstandingCase4).to.equal(BigNumber.from('2040816326530612244'));
    expect(performanceUpdateEvent.sharesOutstandingDiff).to.equal(sharesOutstandingCase4);
    expect(expectedPerformanceFee).to.equal(utils.parseEther('5'));
    expect(performanceFeeObtained.sub(expectedPerformanceFee)).to.be.above(-5).below(5);
  });

  it('Migrate should trigger the performance update before destruct', async function () {
    // Trading the denomination asset
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

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
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;

    await newFundDeployer.signalMigration(vault.address, comptrollerDeployedEvent.comptrollerProxy);
    /// Migrating Fund Requested ///

    // Executing the migration
    const executeMigrationTx = await newFundDeployer.executeMigration(vault.address);
    const executeMigrationReceipt = await executeMigrationTx.wait();

    const trackedAssets = await vault.getTrackedAssets();
    // ComptrollerLib SharesRedeemed event
    const sharesRedeemedEvents = filterEventsByABI(executeMigrationReceipt, [sharesRedeemedABI]);
    expect(sharesRedeemedEvents.length).to.equal(2);

    // VaultLib (and token) Transfer events
    // Total Transfer Events
    // Mint Outstanding shares - 1
    // Transfer Vault owner split - 1
    // Burn while redeem for staking and fndzDao - 2
    // Assets transfer to staking - transackedAsset Count (2)
    // Assets tranfer to fndzDao - trackedAsset Count (2)
    const transferEvents = filterEventsByABI(executeMigrationReceipt, [transferABI]);
    expect(transferEvents.length).to.equal(8);

    const outStandingSharesMintEvents = transferEvents.filter(
      (event) => event.args.from == ethers.constants.AddressZero && event.args.to == vault.address,
    );
    expect(outStandingSharesMintEvents.length).to.equal(1);
    const sharesOutstanding = outStandingSharesMintEvents[0].args.value;

    // Transfer for vault owner
    const ownerShareTransferEvents = transferEvents.filter(
      (event) => event.args.from === vault.address && event.args.to === deployer.address,
    );
    expect(ownerShareTransferEvents.length).to.equal(1);
    const sharesTransferredToVaultOwner = ownerShareTransferEvents[0].args.value;

    // Verify whether the vault owner received the correct split value
    const performanceData = await fndzController.getPerformanceFeeData(deployer.address);
    expect(sharesTransferredToVaultOwner).to.equal(sharesOutstanding.mul(performanceData[2]).div(performanceData[4]));

    // Transfer events of the Tracked assets being sent to staking and dao
    // Count -> Tracked Assets * (1 fndzDao + 1 Staking)
    const trackedAssetsTransferEvents = transferEvents.filter(
      (event) =>
        event.args.from === vault.address &&
        event.args.to != deployer.address &&
        event.args.to != ethers.constants.AddressZero,
    );
    expect(trackedAssetsTransferEvents.length).to.equal(trackedAssets.length * 2);

    // Total number of virtual shares
    const totalVirtualSharesRedeemed = sharesRedeemedEvents.reduce((total, currentEvent) => {
      if (currentEvent.args.isVirtual) {
        total = total.add(currentEvent.args.sharesQuantity);
      }
      return total;
    }, BigNumber.from('0'));

    expect(sharesTransferredToVaultOwner.add(totalVirtualSharesRedeemed)).to.equal(sharesOutstanding);

    // Check that denomination asset Transfer events correspond with ComptrollerLib SharesRedeemed events
    for (let i = 0; i < sharesRedeemedEvents.length; i += 1) {
      expect(sharesRedeemedEvents[i].args.receivedAssets.length).to.equal(trackedAssets.length);
      expect(sharesRedeemedEvents[i].args.receivedAssetQuantities.length).to.equal(trackedAssets.length);
      expect(trackedAssets).to.eql(sharesRedeemedEvents[i].args.receivedAssets);
      expect(sharesRedeemedEvents[i].args.isVirtual).to.equal(true);
    }

    const sharesTotalSupply = await vault.totalSupply();
    const vaultOwnerShares = await vault.balanceOf(deployer.address);
    const vaultDenominationAssetsBalance = await denominationAsset.balanceOf(vault.address);
    const vaultTradedAssetBalance = await tradedAsset.balanceOf(vault.address);
    const fndzStakingDenominationAssetsBalance = await denominationAsset.balanceOf(fndzStakingPool);
    const fndzStakingTradedAssetBalance = await tradedAsset.balanceOf(fndzStakingPool);
    const fndzDaoDenominationAssetsBalance = await denominationAsset.balanceOf(fndzDao);
    const fndzDaoTradedAssetBalance = await tradedAsset.balanceOf(fndzDao);

    expect(vaultOwnerShares / sharesTotalSupply).to.equal(0.008403361344537815);
    expect(fndzStakingDenominationAssetsBalance / vaultDenominationAssetsBalance).to.equal(0.004201680672268907);
    expect(fndzStakingTradedAssetBalance / vaultTradedAssetBalance).to.equal(0.004201680672268907);
    expect(fndzDaoDenominationAssetsBalance / vaultDenominationAssetsBalance).to.equal(0.004201680672268907);
    expect(fndzDaoTradedAssetBalance / vaultTradedAssetBalance).to.equal(0.004201680672268907);

    // Checking the stake and fndz dao balances
    expect((await denominationAsset.balanceOf(fndzStakingPool)).gt(0)).to.be.true;
    expect((await tradedAsset.balanceOf(fndzStakingPool)).gt(0)).to.be.true;
    // Due to the empty pairs in uniswap the tracked assets directly sent to the fndzDao
    expect((await denominationAsset.balanceOf(fndzDao)).gt(0)).to.be.true;
    expect((await tradedAsset.balanceOf(fndzDao)).gt(0)).to.be.true;
  });

  it('Should transfer shares to fndzStaking and fndzDao instead of assets if the transfer failed', async function () {
    expect(await vault.balanceOf(fndzDao)).to.equal(0);
    expect(await vault.balanceOf(fndzStakingPool)).to.equal(0);
    // Trading the denomination asset
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Pausing the Denomination to Make the Transfer Fail
    await mockBUSD.pause();
    const vaultOwner = deployer;

    // Advancing the time to complete the crystallization period for payout
    await advanceTime(crystallizationPeriod);

    const payoutTx = await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(
      comptroller.address,
      [contracts.PerformanceFee],
    );
    const payoutReceipt = await payoutTx.wait();

    // VaultLib (and token) Transfer events
    // Total Transfer Events
    // Mint Outstanding shares - 1
    // Transfer Vault owner, fndzStaking and fndzDao splits - 3
    // Burning transfers before redeemShares - 2
    const transferEvents = filterEventsByABI(payoutReceipt, [transferABI]);
    expect(transferEvents.length).to.equal(6);
    // Transfer event of outstanding shares being minted
    const outstandingSharesTransferEvents = transferEvents.filter(
      (event) => event.args.from === ethers.constants.AddressZero && event.args.to === vault.address,
    );
    expect(outstandingSharesTransferEvents.length).to.equal(1);
    const outstandingShares = outstandingSharesTransferEvents[0].args.value;
    // Transfer event of vault owner shares being minted
    const ownerShareTransferEvents = transferEvents.filter(
      (event) => event.args.from === vault.address && event.args.to === vaultOwner.address,
    );
    expect(ownerShareTransferEvents.length).to.equal(1);
    const sharesMintedToVaultOwner = ownerShareTransferEvents[0].args.value;
    // Transfer event of fndzStaking shares being minter
    const fndzStakingTransferEvents = transferEvents.filter(
      (event) => event.args.from == ethers.constants.AddressZero && event.args.to == fndzStakingPool,
    );
    expect(fndzStakingTransferEvents.length).to.equal(1);
    const sharesMintedToFndzStaking = fndzStakingTransferEvents[0].args.value;
    // Transfer event of fndzDao shares being minter
    const fndzDaoTransferEvents = transferEvents.filter(
      (event) => event.args.from == ethers.constants.AddressZero && event.args.to == fndzDao,
    );
    expect(fndzDaoTransferEvents.length).to.equal(1);
    const sharesMintedToFndzDao = fndzDaoTransferEvents[0].args.value;
    // Check that owner shares + virtual shares == total number of shares created
    expect(outstandingShares).to.equal(
      sharesMintedToVaultOwner.add(sharesMintedToFndzStaking).add(sharesMintedToFndzDao),
    );

    const vaultSharesTotalSupply = await vault.totalSupply();
    const vaultOwnerShareBalance = await vault.balanceOf(vaultOwner.address);
    const stakingPoolSharesBalance = await vault.balanceOf(fndzStakingPool);
    const fndzDaoSharesBalance = await vault.balanceOf(fndzDao);

    expect(sharesMintedToFndzStaking).to.equal(stakingPoolSharesBalance);
    expect(sharesMintedToFndzDao).to.equal(fndzDaoSharesBalance);

    expect(vaultOwnerShareBalance / outstandingShares).to.equal(0.5);
    expect(stakingPoolSharesBalance / outstandingShares).to.equal(0.25);
    expect(fndzDaoSharesBalance / outstandingShares).to.equal(0.25);

    expect(vaultOwnerShareBalance / vaultSharesTotalSupply).to.equal(0.008333333333333335);
    expect(stakingPoolSharesBalance / vaultSharesTotalSupply).to.equal(0.0041666666666666675);
    expect(fndzDaoSharesBalance / vaultSharesTotalSupply).to.equal(0.0041666666666666675);
  });
});

describe('Performance Fee Test Cases (FNDZ DAO Desired Currency != Denomination Asset)', function () {
  beforeEach(async function () {
    // Creating a Vault with 10% of performance fee
    const abiCoder = new ethers.utils.AbiCoder();
    const encodedFeeParams = abiCoder.encode(['uint', 'uint'], [performanceFeePercentage, crystallizationPeriod]);
    const encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[contracts.PerformanceFee], [encodedFeeParams]]);

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'Performance Fee Test',
      denominationAsset.address,
      '1',
      encodedFeeData,
      emptyConfigData,
    );
    const newFundReceipt = await newFundTx.wait();

    const { comptrollerProxy, vaultProxy } = getFundAddresses(newFundReceipt);

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    comptroller = ComptrollerLib.attach(comptrollerProxy);
    expect(comptroller).to.be.an('object');

    const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
    vault = VaultLib.attach(vaultProxy);
    expect(vault).to.be.an('object');

    // BUSD to DAI Pair
    const UniswapPair1 = await ethers.getContractFactory('MockUniswapV2Pair', deployer);
    const uniswapPair1 = await UniswapPair1.deploy(
      mockBUSD.address,
      mockDai.address,
      utils.parseEther('1000'),
      utils.parseEther('1000'),
      BigNumber.from('1000'),
    );
    await uniswapPair1.deployed();
    // DAI to BUSD Pair
    const UniswapPair2 = await ethers.getContractFactory('MockUniswapV2Pair', deployer);
    const uniswapPair2 = await UniswapPair2.deploy(
      mockDai.address,
      mockBUSD.address,
      utils.parseEther('1000'),
      utils.parseEther('1000'),
      BigNumber.from('1000'),
    );
    await uniswapPair2.deployed();

    const MockUniswapV2Factory = await hre.ethers.getContractFactory('MockUniswapV2Factory', deployer);
    const mockUniswapV2Factory = MockUniswapV2Factory.attach(contracts.MockUniswapV2Factory);

    // Registering the MockUniswap Pairs
    await mockUniswapV2Factory.registerPair(mockBUSD.address, mockDai.address, uniswapPair1.address);
    await mockUniswapV2Factory.registerPair(mockDai.address, mockBUSD.address, uniswapPair2.address);

    // Depositing 10 tokens
    const investor = accounts[1];
    const depositAmount = utils.parseEther('50');
    await denominationAsset.connect(investor).approve(comptroller.address, depositAmount);
    await comptroller.connect(investor).buyShares(depositAmount, 0, ethers.constants.AddressZero);
  });

  it('Performance Fee splitted correctly and FndzDao only receives the desired token', async function () {
    await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

    // Advancing the time to complete the crystallization period for payout
    await advanceTime(crystallizationPeriod);

    const payoutTx = await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(
      comptroller.address,
      [contracts.PerformanceFee],
    );
    const payoutReceipt = await payoutTx.wait();

    // ComptrollerLib SharesRedeemed event
    const sharesRedeemedEvents = filterEventsByABI(payoutReceipt, [sharesRedeemedABI]);
    expect(sharesRedeemedEvents.length).to.equal(2);

    // Total number of virtual shares
    const totalVirtualSharesRedeemed = sharesRedeemedEvents.reduce((total, currentEvent) => {
      if (currentEvent.args.isVirtual) {
        total = total.add(currentEvent.args.sharesQuantity);
      }
      return total;
    }, BigNumber.from('0'));

    // VaultLib (and token) Transfer events
    // Total Transfer Events
    // Mint Outstanding shares - 1
    // Transfer Vault owner split - 1
    // Burn while redeem for staking and fndzDao - 2
    // Assets transfer to staking - transackedAsset Count (2)
    // Assets tranfer to fndzDao (uniswap Configured - receive denomination asset) - 1
    // Transfer remaining tracked assets(1) to Router - 1
    // We are minting for the Inline Swap and Redeem in MockUniswapV2Router2 - 1
    const transferEvents = filterEventsByABI(payoutReceipt, [transferABI]);
    expect(transferEvents.length).to.equal(9);

    const outStandingSharesMintEvents = transferEvents.filter(
      (event) => event.args.from == ethers.constants.AddressZero && event.args.to == vault.address,
    );
    expect(outStandingSharesMintEvents.length).to.equal(1);
    const sharesOutstanding = outStandingSharesMintEvents[0].args.value;

    // Transfer event of vault owner
    const ownerShareTransferEvents = transferEvents.filter(
      (event) => event.args.from === vault.address && event.args.to === deployer.address,
    );
    expect(ownerShareTransferEvents.length).to.equal(1);
    const sharesTransferredToVaultOwner = ownerShareTransferEvents[0].args.value;

    // Checking the Splitted Shares is Equivalent to sharesOutstanding before payout.
    expect(sharesTransferredToVaultOwner.add(totalVirtualSharesRedeemed)).to.equal(sharesOutstanding);

    // Verifying the fndzDao only received the denomination asset
    expect(await denominationAsset.balanceOf(fndzDao)).to.equal(BigNumber.from('245826736660833818'));
    expect(await tradedAsset.balanceOf(fndzDao)).to.equal(0);
  });
});

describe('Performance Fee Test Suite (Verify splits on Different Stakes)', function () {
  beforeEach(async function () {
    // Creating a Vault with 10% of performance fee
    const performanceFeePercentage = utils.parseEther('0.1');
    const abiCoder = new ethers.utils.AbiCoder();
    const encodedFeeParams = abiCoder.encode(['uint', 'uint'], [performanceFeePercentage, crystallizationPeriod]);
    const encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[contracts.PerformanceFee], [encodedFeeParams]]);

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'Performance Fee Test',
      denominationAsset.address,
      '1',
      encodedFeeData,
      emptyConfigData,
    );
    const newFundReceipt = await newFundTx.wait();

    const { comptrollerProxy, vaultProxy } = getFundAddresses(newFundReceipt);

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    comptroller = ComptrollerLib.attach(comptrollerProxy);
    expect(comptroller).to.be.an('object');

    const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
    vault = VaultLib.attach(vaultProxy);
    expect(vault).to.be.an('object');

    // Depositing 5000 tokens
    const investor = accounts[1];
    const depositAmount = utils.parseEther('5000');
    await denominationAsset.connect(investor).approve(comptroller.address, depositAmount);
    await comptroller.connect(investor).buyShares(depositAmount, 0, ethers.constants.AddressZero);
  });

  it('Shares Outstanding paid to Vault Owner should scale according to how much they have staked', async function () {
    const testCases = [
      {
        stakedAmount: BigNumber.from('0'),
        sharesOutstandingPercentageToVaultOwner: 0.5,
        sharesOutstandingPercentageToStaking: 0.25,
        sharesOutstandingPercentageToDao: 0.25,
      },
      {
        // still tier 0
        stakedAmount: utils.parseEther('1000').sub(1),
        sharesOutstandingPercentageToVaultOwner: 0.5,
        sharesOutstandingPercentageToStaking: 0.25,
        sharesOutstandingPercentageToDao: 0.25,
      },
      {
        stakedAmount: utils.parseEther('1000'),
        sharesOutstandingPercentageToVaultOwner: 0.525,
        sharesOutstandingPercentageToStaking: 0.2375,
        sharesOutstandingPercentageToDao: 0.2375,
      },
      {
        stakedAmount: utils.parseEther('2000').sub(1),
        sharesOutstandingPercentageToVaultOwner: 0.525,
        sharesOutstandingPercentageToStaking: 0.2375,
        sharesOutstandingPercentageToDao: 0.2375,
      },
      {
        stakedAmount: utils.parseEther('2000'),
        sharesOutstandingPercentageToVaultOwner: 0.55,
        sharesOutstandingPercentageToStaking: 0.225,
        sharesOutstandingPercentageToDao: 0.225,
      },
      {
        stakedAmount: utils.parseEther('3000').sub(1),
        sharesOutstandingPercentageToVaultOwner: 0.55,
        sharesOutstandingPercentageToStaking: 0.225,
        sharesOutstandingPercentageToDao: 0.225,
      },
      {
        stakedAmount: utils.parseEther('3000'),
        sharesOutstandingPercentageToVaultOwner: 0.575,
        sharesOutstandingPercentageToStaking: 0.2125,
        sharesOutstandingPercentageToDao: 0.2125,
      },
      {
        stakedAmount: utils.parseEther('4000').sub(1),
        sharesOutstandingPercentageToVaultOwner: 0.575,
        sharesOutstandingPercentageToStaking: 0.2125,
        sharesOutstandingPercentageToDao: 0.2125,
      },
      {
        stakedAmount: utils.parseEther('4000'),
        sharesOutstandingPercentageToVaultOwner: 0.6,
        sharesOutstandingPercentageToStaking: 0.2,
        sharesOutstandingPercentageToDao: 0.2,
      },
      {
        stakedAmount: utils.parseEther('5000').sub(1),
        sharesOutstandingPercentageToVaultOwner: 0.6,
        sharesOutstandingPercentageToStaking: 0.2,
        sharesOutstandingPercentageToDao: 0.2,
      },
      {
        stakedAmount: utils.parseEther('5000'),
        sharesOutstandingPercentageToVaultOwner: 0.625,
        sharesOutstandingPercentageToStaking: 0.1875,
        sharesOutstandingPercentageToDao: 0.1875,
      },
      {
        stakedAmount: utils.parseEther('6000').sub(1),
        sharesOutstandingPercentageToVaultOwner: 0.625,
        sharesOutstandingPercentageToStaking: 0.1875,
        sharesOutstandingPercentageToDao: 0.1875,
      },
      {
        stakedAmount: utils.parseEther('6000'),
        sharesOutstandingPercentageToVaultOwner: 0.65,
        sharesOutstandingPercentageToStaking: 0.175,
        sharesOutstandingPercentageToDao: 0.175,
      },
      {
        stakedAmount: utils.parseEther('7000').sub(1),
        sharesOutstandingPercentageToVaultOwner: 0.65,
        sharesOutstandingPercentageToStaking: 0.175,
        sharesOutstandingPercentageToDao: 0.175,
      },
      {
        stakedAmount: utils.parseEther('7000'),
        sharesOutstandingPercentageToVaultOwner: 0.675,
        sharesOutstandingPercentageToStaking: 0.1625,
        sharesOutstandingPercentageToDao: 0.1625,
      },
      {
        stakedAmount: utils.parseEther('8000').sub(1),
        sharesOutstandingPercentageToVaultOwner: 0.675,
        sharesOutstandingPercentageToStaking: 0.1625,
        sharesOutstandingPercentageToDao: 0.1625,
      },
      {
        stakedAmount: utils.parseEther('8000'),
        sharesOutstandingPercentageToVaultOwner: 0.7,
        sharesOutstandingPercentageToStaking: 0.15,
        sharesOutstandingPercentageToDao: 0.15,
      },
      {
        stakedAmount: utils.parseEther('9000').sub(1),
        sharesOutstandingPercentageToVaultOwner: 0.7,
        sharesOutstandingPercentageToStaking: 0.15,
        sharesOutstandingPercentageToDao: 0.15,
      },
      {
        stakedAmount: utils.parseEther('9000'),
        sharesOutstandingPercentageToVaultOwner: 0.725,
        sharesOutstandingPercentageToStaking: 0.1375,
        sharesOutstandingPercentageToDao: 0.1375,
      },
      {
        stakedAmount: utils.parseEther('10000').sub(1),
        sharesOutstandingPercentageToVaultOwner: 0.725,
        sharesOutstandingPercentageToStaking: 0.1375,
        sharesOutstandingPercentageToDao: 0.1375,
      },
      {
        stakedAmount: utils.parseEther('10000'),
        sharesOutstandingPercentageToVaultOwner: 0.75,
        sharesOutstandingPercentageToStaking: 0.125,
        sharesOutstandingPercentageToDao: 0.125,
      },
      {
        // max already hit @ 10000
        stakedAmount: utils.parseEther('11000'),
        sharesOutstandingPercentageToVaultOwner: 0.75,
        sharesOutstandingPercentageToStaking: 0.125,
        sharesOutstandingPercentageToDao: 0.125,
      },
    ];
    for (let i = 0; i < testCases.length; i += 1) {
      if (testCases[i].stakedAmount > 0) {
        const stakedAmount = await fndzStaking.getStakedAmount(deployer.address);
        const balanceStakeAmount = testCases[i].stakedAmount.sub(stakedAmount);
        await fndzToken.approve(fndzStaking.address, balanceStakeAmount);
        await fndzStaking.stakeFNDZ(balanceStakeAmount);
      }

      // Trading the denomination asset
      await comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData);

      // Advancing the time to complete the crystallization period for payout
      await advanceTime(crystallizationPeriod);

      // Triggering the payout
      const payoutTx = await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(
        comptroller.address,
        [contracts.PerformanceFee],
      );
      const payoutReceipt = await payoutTx.wait();

      // ComptrollerLib SharesRedeemed event
      const sharesRedeemedEvents = filterEventsByABI(payoutReceipt, [sharesRedeemedABI]);
      expect(sharesRedeemedEvents.length).to.equal(2);

      // Filtering the Shares minted and splitted from the Transfer Events
      const transferEvents = filterEventsByABI(payoutReceipt, [transferABI]);
      expect(transferEvents.length).to.equal(8);

      // Outstanding Shares Minted Event
      const outStandingSharesMintEvents = transferEvents.filter(
        (event) => event.args.from == ethers.constants.AddressZero && event.args.to == vault.address,
      );
      expect(outStandingSharesMintEvents.length).to.equal(1);
      const sharesOutstanding = outStandingSharesMintEvents[0].args.value;

      // Transfer Event of the Vault Owner Split
      const ownerShareTransferEvents = transferEvents.filter(
        (event) => event.args.from === vault.address && event.args.to === deployer.address,
      );
      expect(ownerShareTransferEvents.length).to.equal(1);
      const sharesTransferredToVaultOwner = ownerShareTransferEvents[0].args.value;

      // Total number of virtual shares Redeemed for the Fndz staking and Fndz Dao splits
      const fndzStakingShares = sharesRedeemedEvents[0].args.sharesQuantity;
      const fndzDaoShares = sharesRedeemedEvents[1].args.sharesQuantity;

      const paidOutShares = sharesTransferredToVaultOwner.add(fndzStakingShares).add(fndzDaoShares);
      expect(sharesOutstanding.gt(0)).to.be.true;
      expect(sharesOutstanding).to.equal(paidOutShares);

      // helper to round to 4 decimal places
      const round = (numb) => Math.round((numb + Number.EPSILON) * 10000) / 10000;

      const actualVaultOwnerPercentage = round(sharesTransferredToVaultOwner / sharesOutstanding);
      const actualStakingPercentage = round(fndzStakingShares / sharesOutstanding);
      const actualDaoPercentage = round(fndzDaoShares / sharesOutstanding);
      expect(actualVaultOwnerPercentage).to.equal(testCases[i].sharesOutstandingPercentageToVaultOwner);
      expect(actualStakingPercentage).to.equal(testCases[i].sharesOutstandingPercentageToStaking);
      expect(actualDaoPercentage).to.equal(testCases[i].sharesOutstandingPercentageToDao);
    }
  });
});
