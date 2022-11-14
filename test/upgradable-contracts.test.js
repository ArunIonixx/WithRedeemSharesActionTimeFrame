/* eslint-disable @typescript-eslint/no-var-requires */
const { expect } = require('chai');
const { BigNumber, utils } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { getFundAddresses, filterEventsByABI, emptyConfigData, extractEventArgs } = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let feeRate;

let fndzController;
let referralRegistry;
let comptroller;
let vault;
let denominationAsset;

// Events
const updateNewStateVariableEventABI = 'event NewStateVariableUpdated(uint256 _value)';

beforeEach(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = await FNDZController.attach(contracts.FNDZController);

  const ReferralRegistry = await ethers.getContractFactory('ReferralRegistry', deployer);
  referralRegistry = ReferralRegistry.attach(contracts.ReferralRegistry);

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  denominationAsset = MockToken.attach(contracts.mockTokens.MockBUSD);

  // Creating a Fund
  feeRate = ethers.utils.parseEther('0.01');
  const encodedFeeParams = new utils.AbiCoder().encode(['uint256'], [feeRate]);
  const encodedReferralFeeConfig = new utils.AbiCoder().encode(
    ['address[]', 'bytes[]'],
    [[contracts.EntranceReferralFee], [encodedFeeParams]],
  );

  const newFundTx = await fndzController.createNewFund(
    deployer.address,
    'Test Fund',
    denominationAsset.address,
    '1',
    encodedReferralFeeConfig,
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
});

describe('Upgradable Contract Test Suite', function () {
  it('Should be able to upgrade FNDZController', async function () {
    // Upgrading the Proxy
    const MockFNDZControllerV2 = await ethers.getContractFactory('MockFNDZControllerV2', deployer);
    const mockFNDZControllerV2 = await upgrades.upgradeProxy(fndzController.address, MockFNDZControllerV2);
    expect(mockFNDZControllerV2).to.be.an('object');

    // Calling an updated method
    const newStateVariable = 1;
    const updateTx = await mockFNDZControllerV2.updateNewStateVariable(newStateVariable);
    const updateReceipt = await updateTx.wait();
    const updateEvents = await filterEventsByABI(updateReceipt, [updateNewStateVariableEventABI]);
    expect(updateEvents.length).to.equal(1);
    expect(updateEvents[0].args._value).to.equal(newStateVariable);
    expect(await mockFNDZControllerV2.getNewStateVariable()).to.equal(newStateVariable);

    // Checking other state variables
    expect(await mockFNDZControllerV2.getParaSwapFee()).to.equal(20);
    expect(await mockFNDZControllerV2.getOwner()).to.equal(deployer.address);
    expect(await mockFNDZControllerV2.getInlineSwapRouterAddress()).to.equal(contracts.MockUniswapV2Router2);
    const managementFeeData = await mockFNDZControllerV2.getManagementFeeData();
    expect(managementFeeData[0]).to.equal(contracts.FNDZStaking);
    expect(managementFeeData[1]).to.equal(accounts[9].address);
    expect(managementFeeData[2]).to.equal(BigNumber.from('500000000000000000'));
    expect(managementFeeData[3]).to.equal(BigNumber.from('250000000000000000'));
    expect(managementFeeData[4]).to.equal(utils.parseEther('1'));
    const feeInlineSwapData = await mockFNDZControllerV2.getFeeInlineSwapData();
    expect(feeInlineSwapData[0]).to.equal(contracts.MockUniswapV2Factory);
    expect(feeInlineSwapData[1]).to.equal(contracts.mockTokens.MockBUSD);
    expect(feeInlineSwapData[2]).to.equal(60);
    expect(feeInlineSwapData[3]).to.equal(BigNumber.from('950000000000000000'));
    expect(feeInlineSwapData[4]).to.equal(utils.parseEther('1'));
    const performanceFeeData = await mockFNDZControllerV2.getPerformanceFeeData(deployer.address);
    expect(performanceFeeData[0]).to.equal(contracts.FNDZStaking);
    expect(performanceFeeData[1]).to.equal(accounts[9].address);
    expect(performanceFeeData[2]).to.equal(BigNumber.from('500000000000000000'));
    expect(performanceFeeData[3]).to.equal(BigNumber.from('250000000000000000'));
    expect(performanceFeeData[4]).to.equal(utils.parseEther('1'));
    expect(await mockFNDZControllerV2.isDenominationAssetApproved(denominationAsset.address)).to.be.true;
    const managementFeeConfig = await mockFNDZControllerV2.getFeeConfiguration(contracts.ManagementFee);
    expect(managementFeeConfig[0]).to.be.true;
    expect(managementFeeConfig[1][0]).to.equal(BigNumber.from('0'));
    expect(managementFeeConfig[2][0]).to.equal(BigNumber.from('1000000000965855133796871400'));
    const performanceFeeConfig = await mockFNDZControllerV2.getFeeConfiguration(contracts.PerformanceFee);
    expect(performanceFeeConfig[0]).to.be.true;
    expect(performanceFeeConfig[1][0]).to.equal(BigNumber.from('0'));
    expect(performanceFeeConfig[1][1]).to.equal(BigNumber.from('604800'));
    expect(performanceFeeConfig[2][0]).to.equal(utils.parseEther('0.3'));
    expect(performanceFeeConfig[2][1]).to.equal(BigNumber.from('7884000'));
    const referralFeeConfig = await mockFNDZControllerV2.getFeeConfiguration(contracts.EntranceReferralFee);
    expect(referralFeeConfig[0]).to.be.true;
    expect(referralFeeConfig[1][0]).to.equal(utils.parseEther('0.005'));
    expect(referralFeeConfig[2][0]).to.equal(utils.parseEther('0.01'));
  });

  it('Should be able to upgrade ReferralRegistry', async function () {
    // Adding a Referral to test after upgrade
    const referrer = accounts[2];
    const referee = deployer;
    await denominationAsset.connect(referee).approve(comptroller.address, utils.parseEther('2'));
    await comptroller.connect(referee).buyShares(utils.parseEther('1'), 0, referrer.address);
    const referrerBalance = await vault.balanceOf(referrer.address);

    // Upgrading the Proxy
    const MockReferralRegistryV2 = await ethers.getContractFactory('MockReferralRegistryV2', deployer);
    const mockReferralRegistryV2 = await upgrades.upgradeProxy(referralRegistry.address, MockReferralRegistryV2);
    expect(MockReferralRegistryV2).to.be.an('object');

    // Checking the Referral
    expect(await mockReferralRegistryV2.isReferredAddress(vault.address, referee.address)).to.be.true;
    expect(await mockReferralRegistryV2.getReferrer(vault.address, referee.address)).to.equal(referrer.address);
    // Subsequent deposit of same referee without referrer in buyShares
    const buyTx = await comptroller.connect(referee).buyShares(utils.parseEther('1'), 0, ethers.constants.AddressZero);
    const buyReceipt = await buyTx.wait();
    const { sharesIssued, sharesReceived } = extractEventArgs(buyReceipt, 'SharesBought');
    const expectedReferralFee = sharesIssued.mul(feeRate).div(ethers.utils.parseEther('1').add(feeRate));
    expect(sharesIssued.sub(expectedReferralFee)).to.equal(sharesReceived);
    const currentReferrerBalance = await vault.balanceOf(referrer.address);
    expect(currentReferrerBalance.sub(referrerBalance)).to.equal(expectedReferralFee);

    // Calling an updated method
    const newStateVariable = 1;
    const updateTx = await mockReferralRegistryV2.updateNewStateVariable(newStateVariable);
    const updateReceipt = await updateTx.wait();
    const updateEvents = await filterEventsByABI(updateReceipt, [updateNewStateVariableEventABI]);
    expect(updateEvents.length).to.equal(1);
    expect(updateEvents[0].args._value).to.equal(newStateVariable);
    expect(await mockReferralRegistryV2.getNewStateVariable()).to.equal(newStateVariable);
  });
});
