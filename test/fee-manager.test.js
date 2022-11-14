/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { utils } = require('ethers');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { emptyConfigData, getFundAddresses, filterEvents } = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let abiCoder;
let comptrollerProxy;

let feeManager;
let fndzController;

describe('FeeManager Test Suite', function () {
  beforeEach(async function () {
    // runs before each test in this block
    contracts = await deployments();
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    abiCoder = new utils.AbiCoder();

    const FeeManager = await ethers.getContractFactory('FeeManager', deployer);
    feeManager = await FeeManager.attach(contracts.FeeManager);
    expect(feeManager).to.be.an('object');

    const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
    fndzController = FNDZController.attach(contracts.FNDZController);
    expect(fndzController).to.be.an('object');
  });

  it('Should be able to register fees and verify the event', async function () {
    const fees = [contracts.PerformanceFee];
    // Deregistering to test
    await feeManager.deregisterFees(fees);

    const registerTx = await feeManager.registerFees(fees);
    const registerReceipt = await registerTx.wait();
    const feeRegisteredEvents = filterEvents(registerReceipt, 'FeeRegistered');
    expect(feeRegisteredEvents.length).to.equal(1);
    expect(feeRegisteredEvents[0].args[0]).to.equal(fees[0]);
  });

  it('Verify registerFees negative cases', async function () {
    const fees = [contracts.PerformanceFee];
    // Deregistering to test
    await feeManager.deregisterFees(fees);

    // Only Fund Deployer can call
    await expect(feeManager.connect(accounts[1]).registerFees(fees)).to.revertedWith('onlyFundDeployerOwner');

    // cannot use empty list of addresses
    await expect(feeManager.registerFees([])).to.revertedWith('registerFees: _fees cannot be empty');

    // Cannot register fees multiple times
    await feeManager.registerFees(fees);
    await expect(feeManager.registerFees(fees)).to.revertedWith('registerFees: fee already registered');
  });

  it('Should be able to deregister fees and verify the event', async function () {
    const fees = [contracts.PerformanceFee];

    const deregisterTx = await feeManager.deregisterFees(fees);
    const deregisterReceipt = await deregisterTx.wait();
    const feeDeregisteredEvents = filterEvents(deregisterReceipt, 'FeeDeregistered');
    expect(feeDeregisteredEvents.length).to.equal(1);
    expect(feeDeregisteredEvents[0].args[0]).to.equal(fees[0]);
  });

  it('Verify deregisterFees negative cases', async function () {
    const fees = [contracts.PerformanceFee];
    // Deregistering to test
    await feeManager.deregisterFees(fees);

    // Only Fund Deployer can call
    await expect(feeManager.connect(accounts[1]).deregisterFees(fees)).to.revertedWith('onlyFundDeployerOwner');

    // cannot use empty list of addresses
    await expect(feeManager.deregisterFees([])).to.revertedWith('registerFees: _fees cannot be empty');

    // Cannot deregister fees which is not registered
    await expect(feeManager.deregisterFees(fees)).to.revertedWith('deregisterFees: fee is not registered');
  });

  it('Should be able to get registered Fees', async function () {
    const registeredFees = await feeManager.getRegisteredFees();
    expect(registeredFees.length).to.equal(4);
    expect(registeredFees).to.contain(contracts.PerformanceFee);
    expect(registeredFees).to.contain(contracts.ManagementFee);
    expect(registeredFees).to.contain(contracts.EntranceReferralFee);
    expect(registeredFees).to.contain(contracts.FNDZInvestmentFee);
  });

  it('Should be able to fetch enabled fees for fund', async function () {
    /// Creating a Vault
    const encodedManagementFeeData = abiCoder.encode(['uint256'], [utils.parseEther('0.02')]);
    const encodedReferralFeeData = abiCoder.encode(['uint256'], [utils.parseEther('0.01')]);
    const encodedFeeConfig = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [
        [contracts.ManagementFee, contracts.EntranceReferralFee],
        [encodedManagementFeeData, encodedReferralFeeData],
      ],
    );
    const createVaultTx = await fndzController.createNewFund(
      deployer.address,
      'Test Vault',
      contracts.mockTokens.MockBUSD,
      '1',
      encodedFeeConfig,
      emptyConfigData,
    );
    const receipt = await createVaultTx.wait();
    ({ comptrollerProxy } = await getFundAddresses(receipt));

    // Verifying the enabled vaults
    const enabledFees = await feeManager.getEnabledFeesForFund(comptrollerProxy);
    expect(enabledFees.length).to.equal(2);
    expect(enabledFees).to.contain(contracts.ManagementFee);
    expect(enabledFees).to.contain(contracts.EntranceReferralFee);
  });

  it('verify feeUsesGav on different fees', async function () {
    expect(await feeManager.feeUsesGavOnSettle(contracts.PerformanceFee)).to.equal(true);
    expect(await feeManager.feeUsesGavOnSettle(contracts.ManagementFee)).to.equal(false);
    expect(await feeManager.feeUsesGavOnUpdate(contracts.PerformanceFee)).to.equal(true);
    expect(await feeManager.feeUsesGavOnUpdate(contracts.ManagementFee)).to.equal(false);
  });

  it('Verify setConfigForFund functionality', async function () {
    // revert, if the length of addresses and settings data miss matches
    var encodedManagementFeeData = abiCoder.encode(['uint256'], [utils.parseEther('0.01')]);
    var encodedReferralFeeData = abiCoder.encode(['uint256'], [utils.parseEther('0.01')]);
    var encodedFeeConfig = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [[contracts.EntranceReferralFee], [encodedManagementFeeData, encodedReferralFeeData]],
    );
    await expect(
      fndzController.createNewFund(
        deployer.address,
        'Test Vault',
        contracts.mockTokens.MockBUSD,
        '1',
        encodedFeeConfig,
        emptyConfigData,
      ),
    ).to.revertedWith('setConfigForFund: fees and settingsData array lengths unequal');

    // revert, if addresses list contains duplicates
    var encodedReferralFeeData = abiCoder.encode(['uint256'], [utils.parseEther('0.01')]);
    encodedFeeConfig = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [
        [contracts.ManagementFee, contracts.ManagementFee],
        [encodedManagementFeeData, encodedReferralFeeData],
      ],
    );
    await expect(
      fndzController.createNewFund(
        deployer.address,
        'Test Vault',
        contracts.mockTokens.MockBUSD,
        '1',
        encodedFeeConfig,
        emptyConfigData,
      ),
    ).to.revertedWith('setConfigForFund: fees cannot include duplicates');

    // reverts, if a fund uses an un registered address
    await feeManager.deregisterFees([contracts.ManagementFee]);
    encodedFeeConfig = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [[contracts.ManagementFee], [encodedManagementFeeData]],
    );
    await expect(
      fndzController.createNewFund(
        deployer.address,
        'Test Vault',
        contracts.mockTokens.MockBUSD,
        '1',
        encodedFeeConfig,
        emptyConfigData,
      ),
    ).to.revertedWith('setConfigForFund: Fee is not registered');
  });
});
