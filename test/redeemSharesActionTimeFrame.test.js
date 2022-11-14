/* eslint-disable prettier/prettier */
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { emptyConfigData, filterEventsByABI,sharesRedeemedABI, getFundAddresses, advanceTime } = require('./utils/fndz-utilities.js');
// One Day in Seconds
const DAY = 86400;
let contracts;
let accounts;
let abiCoder;
let deployer;
let redeemSharesActionTimeFrame;
let fndzController;
beforeEach(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  abiCoder = new utils.AbiCoder();
  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contracts.FNDZController);
  const RedeemSharesActionTimeFrame = await ethers.getContractFactory('RedeemSharesActionTimeFrame', deployer);
  redeemSharesActionTimeFrame = RedeemSharesActionTimeFrame.attach(contracts.RedeemSharesActionTimeFrame);
  const sharesActionPeriod = 5 * DAY;
  const shortingPeriod = 20 * DAY;
  const encodedFeeParams = abiCoder.encode(['uint256', 'uint256'], [sharesActionPeriod, shortingPeriod]);
  const encodedShortFeeConfig = abiCoder.encode(
    ['address[]', 'bytes[]'],
    [[contracts.RedeemSharesActionTimeFrame], [encodedFeeParams]],
  );
  /// Creating a Vault
  const createVaultTx = await fndzController.createNewFund(
    deployer.address,
    'Test Vault',
    contracts.mockTokens.MockBUSD,
    '1',
    encodedShortFeeConfig,
    emptyConfigData,
  );
  const response = await createVaultTx.wait();
  ({ comptrollerProxy, vaultProxy } = await getFundAddresses(response));

  const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
  comptrollerLib = ComptrollerLib.attach(comptrollerProxy);

  const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
  vaultLib = VaultLib.attach(vaultProxy);

  const BUSDToken = await ethers.getContractFactory('MockToken', deployer);
  busdToken = BUSDToken.attach(contracts.mockTokens.MockBUSD);

  // Minting BUSD to test buy shares
  for (var i = 1; i < 3; i++) {
    await busdToken.mintFor(accounts[i].address, utils.parseEther('100'));
  }
});
describe(' RedeemSharesActionTimeFrame setup Suite (Vault Setup)', function () {
  it('Sets the valid Parameters correctly while creating Valut', async function () {
    _sharesActionPeriod = 6 * DAY;
    _shortingPeriod = 15 * DAY;
    const encodedFeeParams = abiCoder.encode(['uint256', 'uint256'], [_sharesActionPeriod, _shortingPeriod]);
    encodedShortFeeConfig = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [[contracts.RedeemSharesActionTimeFrame], [encodedFeeParams]],
    );
    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'Test',
      contracts.mockTokens.MockBUSD,
      '1',
      encodedShortFeeConfig,
      emptyConfigData,
    );
    const newFundReceipt = await newFundTx.wait();
    const { comptrollerProxy: comptrollerAddress } = getFundAddresses(newFundReceipt);
    const fundSettingsAddedEvents = filterEventsByABI(newFundReceipt, [
      'event FundSettingsAdded(address indexed comptrollerProxy,uint256 sharesActionPeriod,uint256 shortingPeriod,uint256 firstSharesActionTimestamp)',
    ]);
    expect(fundSettingsAddedEvents.length).to.equal(1);
    const {
      args: { comptrollerProxy, sharesActionPeriod, shortingPeriod, firstSharesActionTimestamp },
    } = fundSettingsAddedEvents[0];
    const blockNumber = newFundReceipt.blockNumber;
    const timestamp = (await ethers.provider.getBlock(blockNumber)).timestamp;
    expect(comptrollerAddress).to.equal(comptrollerProxy);
    expect(sharesActionPeriod).to.equal(6 * DAY);
    expect(shortingPeriod).to.equal(15 * DAY);
    expect(firstSharesActionTimestamp).to.equal(timestamp);
  });
  it('Does not allow valut creation for invalid Parameters1', async function () {
    const encodedFeeParams = abiCoder.encode(['uint256', 'uint256'], [5 * DAY, 3 * DAY]);
    const encodedShortFeeConfig = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [[contracts.RedeemSharesActionTimeFrame], [encodedFeeParams]],
    );

    await expect(
      fndzController.createNewFund(
        deployer.address,
        'Test',
        contracts.mockTokens.MockBUSD,
        '1',
        encodedShortFeeConfig,
        emptyConfigData,
      ),
    ).to.be.revertedWith('createNewFund: fee parameter value is not within the acceptable range');
  });
  it('Does not allow valut creation for invalid Parameters2', async function () {
    const encodedFeeParams = abiCoder.encode(['uint256', 'uint256'], [20 * DAY, 15 * DAY]);
    encodedShortFeeConfig = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [[contracts.RedeemSharesActionTimeFrame], [encodedFeeParams]],
    );
    await expect(
      fndzController.createNewFund(
        deployer.address,
        'Test',
        contracts.mockTokens.MockBUSD,
        '1',
        encodedShortFeeConfig,
        emptyConfigData,
      ),
    ).to.be.revertedWith('createNewFund: fee parameter value is not within the acceptable range');
  });
});
describe('GetCurrentTimeFrame test suite', function () {
  it('Should be able to get the Timeframe info ', async function () {
    //Valut Setup => sharesActionPeriod : 5 Days and shortingPeriod : 20 Days;
    // 0 represents TimeFrame.SHARES_ACTION_TIMEFRAME
    // 1 representsTimeFrame.SHORTING_TIMEFRAME
    const timeFrameTx = await redeemSharesActionTimeFrame.getCurrentTimeframe(comptrollerProxy);
    expect(timeFrameTx).to.equal(0);
    await advanceTime(5 * DAY + 1); // 5 Days in advance - 6th DAY from valut Creation.
    await ethers.provider.send('evm_mine');
    const timeFrameTx1 = await redeemSharesActionTimeFrame.getCurrentTimeframe(comptrollerProxy);
    expect(timeFrameTx1).to.equal(1);
    await advanceTime(20 * DAY + 1); // 20 Days in advance - 25th DAY from valut Creation.
    await ethers.provider.send('evm_mine');
    const timeFrameTx2 = await redeemSharesActionTimeFrame.getCurrentTimeframe(comptrollerProxy);
    expect(timeFrameTx2).to.equal(0);
    await advanceTime(5 * DAY + 1); // 5 Days in advance - 31th DAY from valut Creation.
    await ethers.provider.send('evm_mine');
    const timeFrameTx3 = await redeemSharesActionTimeFrame.getCurrentTimeframe(comptrollerProxy);
    expect(timeFrameTx3).to.equal(1);
  });
});
describe('Buyshare test suite', function () {
  it('Should be allow to Buy Shares in sharesActionPeriod', async function () {
    // Approving allowance to the comptroller
    await busdToken.approve(comptrollerProxy, BigNumber.from('1000000000000000000'));
    // Deposit via buyShares
    const buySharesTx = await comptrollerLib.buyShares(
      BigNumber.from('1000000000000000000'),
      BigNumber.from('0'),
      accounts[1].address,
    );
    await buySharesTx.wait();
    const { firstSharesActionTimestamp: _firstSharesActionTimestamp } =
      await redeemSharesActionTimeFrame.getFeeInfoForFund(comptrollerProxy);
    expect(_firstSharesActionTimestamp).to.not.equal(0);
  });
  it('Should be allow to deposit Shares in shortingPeriod', async function () {
    await busdToken.approve(comptrollerProxy, BigNumber.from('1000000000000000000'));
    await advanceTime(10 * DAY); // 10 Day in advance
    const buySharesTx = await comptrollerLib.buyShares(
      BigNumber.from('1000000000000000000'),
      BigNumber.from('0'),
      accounts[1].address,
    );
    await buySharesTx.wait();
    const { firstSharesActionTimestamp } = await redeemSharesActionTimeFrame.getFeeInfoForFund(comptrollerProxy);
    expect(firstSharesActionTimestamp).to.not.equal(0);
  });
  it('Should be allow to deposit Shares always:Buy Shares in various interval', async function () {
    await busdToken.approve(comptrollerProxy, BigNumber.from('1000000000000000000'));
    // Deposit via buyShares
    const buySharesTx = await comptrollerLib.buyShares(
      BigNumber.from('1000000000000000000'),
      BigNumber.from('0'),
      accounts[1].address,
    );
    await buySharesTx.wait();
    await busdToken.approve(comptrollerProxy, BigNumber.from('1000000000000000000'));
    await advanceTime(15 * DAY); // 5 Days in advance - 6th DAY from first Deposit.
    await expect(comptrollerLib.buyShares(BigNumber.from('1000000000000000000'), BigNumber.from('0'), accounts[1].address)
    ).to.be.not.reverted;
    await busdToken.approve(comptrollerProxy, BigNumber.from('1000000000000000000'));
    await advanceTime(25 * DAY); // 25 Days in advance - 31st DAY from first Deposit.
    await expect(comptrollerLib.buyShares(BigNumber.from('1000000000000000000'), BigNumber.from('0'), accounts[1].address)
    ).to.be.not.reverted;
  });
  it('Should be able to get the fee info', async function () {
    await busdToken.approve(comptrollerProxy, BigNumber.from('1000000000000000000'));
    // Deposit via buyShares
    const buySharesTx = await comptrollerLib.buyShares(
      BigNumber.from('1000000000000000000'),
      BigNumber.from('0'),
      accounts[1].address,
    );
    await buySharesTx.wait();
    // Verifying the getFeeInfoForFund
    const feeInfo = await redeemSharesActionTimeFrame.getFeeInfoForFund(comptrollerProxy);
    expect(feeInfo.sharesActionPeriod).to.equal(5 * DAY);
    expect(feeInfo.shortingPeriod).to.equal(20 * DAY);
    expect(feeInfo.firstSharesActionTimestamp).to.not.equal(0);
  });
});
describe('Redeem test suite', function () {
  it('Redeem Shares in valid period', async function () {
    // Approving allowance to the comptroller
    await busdToken.approve(comptrollerProxy, BigNumber.from('1000000000000000000'));
    // Deposit via buyShares
    const buySharesTx = await comptrollerLib.buyShares(
        BigNumber.from('1000000000000000000'),
        BigNumber.from('0'),
        accounts[1].address,
      );
      await buySharesTx.wait();
      const { firstSharesActionTimestamp: _firstSharesActionTimestamp } =
        await redeemSharesActionTimeFrame.getFeeInfoForFund(comptrollerProxy);
      expect(_firstSharesActionTimestamp).to.not.equal(0);
      const redeemTx = await comptrollerLib.redeemSharesDetailed(utils.parseEther('0.1'), [], []);
      const redeemReceipt = await redeemTx.wait();
      const sharesRedeemedEvents = filterEventsByABI(redeemReceipt, [sharesRedeemedABI]);
      expect(sharesRedeemedEvents.length).to.equal(1);
    });
    it('Redeem Shares in invalid period', async function () {
      // Approving allowance to the comptroller
      await busdToken.approve(comptrollerProxy, BigNumber.from('1000000000000000000'));
      // Deposit via buyShares
      const buySharesTx = await comptrollerLib.buyShares(
        BigNumber.from('1000000000000000000'),
        BigNumber.from('0'),
        accounts[1].address,
      );
      await buySharesTx.wait();
      const timeFrameTx = await redeemSharesActionTimeFrame.getCurrentTimeframe(comptrollerProxy);
      expect(timeFrameTx).to.equal(0);
      const redeemTx = await comptrollerLib.redeemSharesDetailed(utils.parseEther('0.1'), [], []);
      const redeemReceipt = await redeemTx.wait();
      await advanceTime(20 * DAY);
      await ethers.provider.send('evm_mine');
      const timeFrameTx1 = await redeemSharesActionTimeFrame.getCurrentTimeframe(comptrollerProxy);
      expect(timeFrameTx1).to.equal(1);
      await expect(comptrollerLib.redeemSharesDetailed(utils.parseEther('0.1'), [], [])
      ).to.be.revertedWith('RedeemSharesActionTimeFrame : Shorting Period - User operations are not allowed');
      await advanceTime(25 * DAY);
      const timeFrameTx2 = await redeemSharesActionTimeFrame.getCurrentTimeframe(comptrollerProxy);
      expect(timeFrameTx2).to.equal(1);
      await expect(comptrollerLib.redeemSharesDetailed(utils.parseEther('0.1'), [], [])
      ).to.be.revertedWith('RedeemSharesActionTimeFrame : Shorting Period - User operations are not allowed');
    });
  });
  