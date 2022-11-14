/* eslint-disable @typescript-eslint/no-var-requires */
const { expect } = require('chai');
const { BigNumber, utils } = require('ethers');
const { ethers } = require('hardhat');
const { deployments } = require('./utils/deploy-test-contracts.js');
const {
  emptyConfigData,
  getFundAddresses,
  extractEventArgs,
  filterEventsByABI,
  comptrollerProxyDeployedEventABI,
} = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let referralRegistry;
let comptrollerProxy;
let comptrollerLib;
let fndzController;
let vaultProxy;
let vaultLib;
let busdToken;
let abiCoder;
let feeRate;
let encodedReferralFeeConfig;

const settledEventABI =
  'event Settled(address indexed comptrollerProxy, address indexed payer, uint256 sharesQuantity)';
const referralAddedEventABI = 'event ReferralAdded(address vaultProxy, address referrer, address referee)';
const feeSetEventABI = 'event FeeAddressSet(address _old, address _new)';

beforeEach(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  abiCoder = new utils.AbiCoder();

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contracts.FNDZController);

  const ReferralRegistry = await ethers.getContractFactory('ReferralRegistry', deployer);
  referralRegistry = ReferralRegistry.attach(contracts.ReferralRegistry);

  feeRate = ethers.utils.parseEther('0.01');
  const encodedFeeParams = abiCoder.encode(['uint256'], [feeRate]);
  encodedReferralFeeConfig = abiCoder.encode(
    ['address[]', 'bytes[]'],
    [[contracts.EntranceReferralFee], [encodedFeeParams]],
  );

  /// Creating a Vault
  const createVaultTx = await fndzController.createNewFund(
    deployer.address,
    'Test Vault',
    contracts.mockTokens.MockBUSD,
    '1',
    encodedReferralFeeConfig,
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

describe('ReferralRegistry test suite', function () {
  ////////////////////////////////////////////////////
  // Buy Shares with Referral & Fee Deduction tests //
  ////////////////////////////////////////////////////
  it('Buy Shares with referrer address should be added to ReferralRegistry', async function () {
    // Approving allowance to the comptroller
    await busdToken.approve(comptrollerProxy, BigNumber.from('1000000000000000000'));

    // Deposit of referee with referrer in buyShares
    await comptrollerLib.buyShares(BigNumber.from('1000000000000000000'), BigNumber.from('0'), accounts[1].address);

    // Verifying the referral in Referral Registry
    expect(await referralRegistry.isReferredAddress(vaultProxy, deployer.address)).to.be.true;
    expect(await referralRegistry.getReferrer(vaultProxy, deployer.address)).to.equal(accounts[1].address);
  });

  it('If referral exists, configured fee should be deducted and added to the referrer', async function () {
    const depositAmount = BigNumber.from('1000000000000000000');
    // Approving allowance to the comptroller
    await busdToken.approve(comptrollerProxy, depositAmount.mul(2));
    // Deposit of referee with referrer in buyShares
    let buyTx = await comptrollerLib.buyShares(depositAmount, BigNumber.from('0'), accounts[1].address);
    let buyReceipt = await buyTx.wait();
    let { sharesIssued, sharesReceived } = extractEventArgs(buyReceipt, 'SharesBought');
    let expectedReferralFee = sharesIssued.mul(feeRate).div(ethers.utils.parseEther('1').add(feeRate));

    expect(sharesIssued.sub(expectedReferralFee)).to.equal(sharesReceived);
    const referrerBalance = await vaultLib.balanceOf(accounts[1].address);
    expect(expectedReferralFee).to.equal(referrerBalance);

    // Subsequent deposit of same referee without referrer in buyShares
    buyTx = await comptrollerLib.buyShares(depositAmount, BigNumber.from('0'), ethers.constants.AddressZero);
    buyReceipt = await buyTx.wait();
    ({ sharesIssued, sharesReceived } = extractEventArgs(buyReceipt, 'SharesBought'));
    expectedReferralFee = sharesIssued.mul(feeRate).div(ethers.utils.parseEther('1').add(feeRate));

    expect(sharesIssued.sub(expectedReferralFee)).to.equal(sharesReceived);
    const currentReferrerBalance = await vaultLib.balanceOf(accounts[1].address);
    expect(expectedReferralFee).to.equal(currentReferrerBalance.sub(referrerBalance));

    // Referral Fee Settled Event
    const settledEvents = filterEventsByABI(buyReceipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(1);
    const event = settledEvents[0].args;
    expect(event.comptrollerProxy).to.equal(comptrollerLib.address);
    expect(event.payer).to.equal(deployer.address);
    expect(event.sharesQuantity).to.equal(expectedReferralFee);
  });

  it('Referral fee should not be deducted if the buyer not referred', async function () {
    const depositAmount = utils.parseEther('10');

    // Investor 1 buying shares with deployer as a referrer
    const investor1 = accounts[1];
    await busdToken.connect(investor1).approve(comptrollerProxy, depositAmount);
    await comptrollerLib.connect(investor1).buyShares(depositAmount, BigNumber.from('0'), deployer.address);

    // Investor 2 buying shares without the referrer
    const investor2 = accounts[2];
    await busdToken.connect(investor2).approve(comptrollerProxy, depositAmount);
    const buyTx = await comptrollerLib
      .connect(investor2)
      .buyShares(depositAmount, BigNumber.from('0'), ethers.constants.AddressZero);
    const buyReceipt = await buyTx.wait();
    const { sharesIssued, sharesReceived } = extractEventArgs(buyReceipt, 'SharesBought');
    // Verifying the issued shares not deducted for Referral Fee
    expect(sharesIssued).to.equal(sharesReceived);
  });

  it('Migration should not affect the added referrals', async function () {
    const depositAmount = utils.parseEther('1');
    await busdToken.approve(comptrollerProxy, depositAmount);

    // Deposit of referee with referrer in buyShares
    let buyTx = await comptrollerLib.buyShares(depositAmount, 0, accounts[1].address);
    let buyReceipt = await buyTx.wait();
    let { sharesIssued, sharesReceived } = extractEventArgs(buyReceipt, 'SharesBought');
    let expectedReferralFee = sharesIssued.mul(feeRate).div(ethers.utils.parseEther('1').add(feeRate));

    expect(sharesIssued.sub(expectedReferralFee)).to.equal(sharesReceived);
    let referrerBalance = await vaultLib.balanceOf(accounts[1].address);
    expect(expectedReferralFee).to.equal(referrerBalance);
    let refereeBalance = await vaultLib.balanceOf(deployer.address);
    expect(depositAmount.sub(expectedReferralFee)).to.equal(refereeBalance);

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
      encodedReferralFeeConfig,
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

    // Redeeming all the shares
    await newComptroller.redeemSharesDetailed(0, [], []);
    await newComptroller.connect(accounts[1]).redeemSharesDetailed(0, [], []);

    // Checking the Referral
    expect(await referralRegistry.getReferrer(vaultProxy, deployer.address)).to.equal(accounts[1].address);

    // Deposit of referee without referrer to Verify the Migration
    await busdToken.approve(newComptroller.address, depositAmount);
    buyTx = await newComptroller.buyShares(depositAmount, 0, ethers.constants.AddressZero);
    buyReceipt = await buyTx.wait();
    ({ sharesIssued, sharesReceived } = extractEventArgs(buyReceipt, 'SharesBought'));
    expectedReferralFee = sharesIssued.mul(feeRate).div(ethers.utils.parseEther('1').add(feeRate));

    expect(sharesIssued.sub(expectedReferralFee)).to.equal(sharesReceived);
    referrerBalance = await vaultLib.balanceOf(accounts[1].address);
    expect(expectedReferralFee).to.equal(referrerBalance);
    refereeBalance = await vaultLib.balanceOf(deployer.address);
    expect(depositAmount.sub(expectedReferralFee)).to.equal(refereeBalance);
    await expect(referralRegistry.getReferrer(vaultProxy, accounts[1].address)).to.revertedWith(
      'getReferral: address is not referred',
    );
    // Try to add new referral in new Comptroller
    await busdToken.connect(accounts[1]).approve(newComptroller.address, depositAmount);
    await newComptroller.connect(accounts[1]).buyShares(depositAmount, 0, accounts[2].address);
    expect(await referralRegistry.getReferrer(vaultProxy, accounts[1].address)).to.equal(accounts[2].address);
  });

  ////////////////////////////////////
  // Referral Registry Methods test //
  ////////////////////////////////////
  it('Should be able to add a referral and verify whether its referred and can get the referral', async function () {
    // Calling buy shares to add a referral
    const depositAmount = BigNumber.from('1000000000000000000');
    await busdToken.approve(comptrollerProxy, depositAmount);
    const buyTx = await comptrollerLib.buyShares(depositAmount, BigNumber.from('0'), accounts[1].address);

    // Verify if it emits ReferralAdded event
    const receipt = await buyTx.wait();
    const events = filterEventsByABI(receipt, [referralAddedEventABI]);
    expect(events.length).to.equal(1);
    const referralAddedEvent = events[0].args;
    expect(referralAddedEvent.vaultProxy).to.equal(vaultProxy);
    expect(referralAddedEvent.referrer).to.equal(accounts[1].address);
    expect(referralAddedEvent.referee).to.equal(deployer.address);

    expect(await referralRegistry.isReferredAddress(vaultProxy, deployer.address)).to.be.true;
    expect(await referralRegistry.getReferrer(vaultProxy, deployer.address)).to.equal(accounts[1].address);
  });

  it('Should not be added to the referrals if _referrer is zeroAddress', async function () {
    // Calling buy shares to add a referral
    const depositAmount = BigNumber.from('1000000000000000000');
    await busdToken.approve(comptrollerProxy, depositAmount);
    await comptrollerLib.buyShares(depositAmount, BigNumber.from('0'), ethers.constants.AddressZero);
    expect(await referralRegistry.isReferredAddress(vaultProxy, accounts[1].address)).to.be.false;
  });

  it('Should not be able to change the referrer once referred', async function () {
    // Calling buy shares to add a referral
    const depositAmount = BigNumber.from('1000000000000000000');
    await busdToken.approve(comptrollerProxy, depositAmount.mul(2));
    await comptrollerLib.buyShares(depositAmount, BigNumber.from('0'), accounts[1].address);
    expect(await referralRegistry.getReferrer(vaultProxy, deployer.address)).to.equal(accounts[1].address);

    // Calling a buyShares with another Referrer and verify the old Referrer not changed
    await comptrollerLib.buyShares(depositAmount, BigNumber.from('0'), accounts[2].address);
    expect(await referralRegistry.getReferrer(vaultProxy, deployer.address)).to.equal(accounts[1].address);
  });

  it('Referrer and Referee should not be same', async function () {
    const depositAmount = BigNumber.from('1000000000000000000').mul(2);
    await busdToken.approve(comptrollerProxy, depositAmount);
    await expect(comptrollerLib.buyShares(depositAmount, BigNumber.from('0'), deployer.address)).to.be.revertedWith(
      'addReferral: _referrer and _referee should not be same',
    );
  });

  it('Should not be able to get the referral if not referred and isReferred should return false', async function () {
    await expect(referralRegistry.getReferrer(vaultProxy, accounts[1].address)).to.be.revertedWith(
      'getReferral: address is not referred',
    );
    expect(await referralRegistry.isReferredAddress(vaultProxy, accounts[1].address)).to.be.false;
  });

  it('Only the owner can set the Fee address', async function () {
    const oldFee = await referralRegistry.feeAddress();

    const NewEntranceReferralFee = await hre.ethers.getContractFactory('EntranceReferralFee');
    const newEntranceReferralFee = await NewEntranceReferralFee.deploy(contracts.FeeManager, referralRegistry.address);
    await newEntranceReferralFee.deployed();

    const setTx = await referralRegistry.setFeeAddress(newEntranceReferralFee.address);
    const setReceipt = await setTx.wait();
    const feeSetEvents = filterEventsByABI(setReceipt, [feeSetEventABI]);
    expect(feeSetEvents.length).to.equal(1);
    expect(feeSetEvents[0].args._old).to.equal(oldFee);
    expect(feeSetEvents[0].args._new).to.equal(newEntranceReferralFee.address);

    await expect(referralRegistry.connect(accounts[1]).setFeeAddress(newEntranceReferralFee.address)).to.revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('Fee Address can not be zero address or other addresses or the existing one', async function () {
    await expect(referralRegistry.setFeeAddress(ethers.constants.AddressZero)).to.revertedWith(
      '_feeAddress can not be zero address',
    );
    const existingFeeAddress = await referralRegistry.feeAddress();
    await expect(referralRegistry.setFeeAddress(existingFeeAddress)).to.revertedWith('_feeAddress already set');
  });
});
