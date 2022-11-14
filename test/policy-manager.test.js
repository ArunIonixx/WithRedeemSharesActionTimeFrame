/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { utils } = require('ethers');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { emptyConfigData, getFundAddresses } = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let abiCoder;
let comptrollerProxy;
let policyManager;

beforeEach(async function () {
  // runs before each test in this block
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  abiCoder = new utils.AbiCoder();

  const PolicyManager = await ethers.getContractFactory('PolicyManager', deployer);
  policyManager = await PolicyManager.attach(contracts.PolicyManager);
  expect(policyManager).to.be.an('object');

  // Deregistering all the registered policies for testing
  const registeredPolicies = await policyManager.getRegisteredPolicies();
  await policyManager.deregisterPolicies(registeredPolicies);

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  const fndzController = FNDZController.attach(contracts.FNDZController);
  expect(fndzController).to.be.an('object');

  /// Creating a Vault
  const createVaultTx = await fndzController.createNewFund(
    deployer.address,
    'Test Vault',
    contracts.mockTokens.MockBUSD,
    '1',
    emptyConfigData,
    emptyConfigData,
  );
  const receipt = await createVaultTx.wait();
  ({ comptrollerProxy } = await getFundAddresses(receipt));
});

describe('PolicyManager Test Cases', function () {
  ///////////////////////////////////////////
  // Independent Policy Manager Test Cases //
  ///////////////////////////////////////////

  it('Should be able to add, get and remove policies', async function () {
    // Registering a policy
    const registerPolicyTx = await policyManager.registerPolicies([contracts.InvestorWhitelist]);
    let txReceipt = await ethers.provider.getTransactionReceipt(registerPolicyTx.hash);
    expect(txReceipt.status).to.equal(1);

    // Get the List of Registered Policies
    let registeredPolicies = await policyManager.getRegisteredPolicies();
    expect(registeredPolicies).to.be.contains(contracts.InvestorWhitelist);

    // Deregistering a registered Policy
    const deregisterPolicyTx = await policyManager.deregisterPolicies([contracts.InvestorWhitelist]);
    txReceipt = await ethers.provider.getTransactionReceipt(deregisterPolicyTx.hash);
    expect(txReceipt.status).to.equal(1);

    registeredPolicies = await policyManager.getRegisteredPolicies();
    expect(registeredPolicies.length).to.be.equals(0);
  });

  it('Should return true/false based on registered policies', async function () {
    const registerPolicyTx = await policyManager.registerPolicies([contracts.InvestorWhitelist]);
    let txReceipt = await ethers.provider.getTransactionReceipt(registerPolicyTx.hash);
    expect(txReceipt.status).to.equal(1);
    expect(await policyManager.policyIsRegistered(contracts.InvestorWhitelist)).to.be.true;

    const deregisterPolicyTx = await policyManager.deregisterPolicies([contracts.InvestorWhitelist]);
    txReceipt = await ethers.provider.getTransactionReceipt(deregisterPolicyTx.hash);
    expect(txReceipt.status).to.equal(1);
    expect(await policyManager.policyIsRegistered(contracts.InvestorWhitelist)).to.be.false;
    expect(await policyManager.policyIsRegistered(contracts.MinMaxInvestment)).to.be.false;
  });

  it('Should emit register and deregister events', async function () {
    const registerPolicyTx = await policyManager.registerPolicies([contracts.InvestorWhitelist]);
    let receipt = await registerPolicyTx.wait();
    expect(receipt.events[0].event).to.be.equals('PolicyRegistered');

    const deregisterPolicyTx = await policyManager.deregisterPolicies([contracts.InvestorWhitelist]);
    receipt = await deregisterPolicyTx.wait();
    expect(receipt.events[0].event).to.be.equals('PolicyDeregistered');
  });

  it('policies to register should not be empty', async function () {
    await expect(policyManager.registerPolicies([])).to.be.revertedWith('registerPolicies: _policies cannot be empty');
  });

  it('policies to deregister should not be empty', async function () {
    await expect(policyManager.deregisterPolicies([])).to.be.revertedWith(
      'registerPolicies: _policies cannot be empty',
    );
  });

  it('Should not be able to register same policy multiple times', async function () {
    await policyManager.registerPolicies([contracts.InvestorWhitelist]);
    await expect(policyManager.registerPolicies([contracts.InvestorWhitelist])).to.be.revertedWith(
      'registerPolicies: policy already registered',
    );
  });

  it('Should not be able to deregister a policy which is not registered', async function () {
    await expect(policyManager.deregisterPolicies([contracts.InvestorWhitelist])).to.be.revertedWith(
      'deregisterPolicies: policy is not registered',
    );
  });

  it('Only the FundDeployer Owner can register or deregister policies', async function () {
    await expect(policyManager.connect(accounts[1]).registerPolicies([contracts.InvestorWhitelist])).to.be.revertedWith(
      'Only the FundDeployer owner can call this function',
    );
    await expect(
      policyManager.connect(accounts[1]).deregisterPolicies([contracts.InvestorWhitelist]),
    ).to.be.revertedWith('Only the FundDeployer owner can call this function');
  });

  ///////////////////////////////////////////
  // Vault Based Policy Manager Test Cases //
  ///////////////////////////////////////////
  it('Should be able to Enable and Get enabled Policies for a Vault', async function () {
    await policyManager.registerPolicies([contracts.InvestorWhitelist]);
    const encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address, accounts[1].address], []]);
    const enablePolicyTx = await policyManager.enablePolicyForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );
    const txReceipt = await ethers.provider.getTransactionReceipt(enablePolicyTx.hash);
    expect(txReceipt.status).to.equal(1);

    const enabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerProxy);
    expect(enabledPolicies.length).to.be.greaterThan(0);
    expect(enabledPolicies).to.be.contains(contracts.InvestorWhitelist);
  });

  it('Should be able to check whether the policy is enabled or not', async function () {
    // Enabling the InvestorWhitelist Policy
    await policyManager.registerPolicies([contracts.InvestorWhitelist]);
    const encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address, accounts[1].address], []]);
    const enablePolicyTx = await policyManager.enablePolicyForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );
    const txReceipt = await ethers.provider.getTransactionReceipt(enablePolicyTx.hash);
    expect(txReceipt.status).to.equal(1);

    expect(await policyManager.policyIsEnabledForFund(comptrollerProxy, contracts.InvestorWhitelist)).to.be.true;
    expect(await policyManager.policyIsEnabledForFund(comptrollerProxy, contracts.MinMaxInvestment)).to.be.false;
  });

  it('Only the fund owner can Enable/Update/Disable policies', async function () {
    // Enabling the InvestorWhitelist Policy
    await policyManager.registerPolicies([contracts.InvestorWhitelist]);
    const encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address, accounts[1].address], []]);
    const enablePolicyTx = await policyManager.enablePolicyForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );
    const txReceipt = await ethers.provider.getTransactionReceipt(enablePolicyTx.hash);
    expect(txReceipt.status).to.equal(1);

    await expect(
      policyManager.connect(accounts[1]).enablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist, '0x'),
    ).to.be.revertedWith('Only the fund owner can call this function');

    await expect(
      policyManager.connect(accounts[1]).disablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist),
    ).to.be.revertedWith('Only the fund owner can call this function');

    await expect(
      policyManager
        .connect(accounts[1])
        .updatePolicySettingsForFund(comptrollerProxy, contracts.InvestorWhitelist, '0x'),
    ).to.be.revertedWith('Only the fund owner can call this function');
  });

  it('Should not be able to enable a policy twice', async function () {
    // Enabling the InvestorWhitelist Policy
    await policyManager.registerPolicies([contracts.InvestorWhitelist]);
    let encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address, accounts[1].address], []]);
    const enablePolicyTx = await policyManager.enablePolicyForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );
    const txReceipt = await ethers.provider.getTransactionReceipt(enablePolicyTx.hash);
    expect(txReceipt.status).to.equal(1);

    encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address, accounts[1].address], []]);
    await expect(
      policyManager.enablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings),
    ).to.be.revertedWith('__enablePolicyForFund: policy already enabled');
  });

  it('Should not be able to use a policy which is not registered', async function () {
    await expect(
      policyManager.enablePolicyForFund(comptrollerProxy, contracts.MinMaxInvestment, '0x'),
    ).to.be.revertedWith('__enablePolicyForFund: Policy is not registered');
  });

  it('Should be able to Update a Policy settings for a Vault', async function () {
    // Enabling the InvestorWhitelist Policy
    await policyManager.registerPolicies([contracts.InvestorWhitelist]);
    let encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address, accounts[1].address], []]);
    const enablePolicyTx = await policyManager.enablePolicyForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );
    let txReceipt = await ethers.provider.getTransactionReceipt(enablePolicyTx.hash);
    expect(txReceipt.status).to.equal(1);

    // Removing accounts[1] from the whitelisted investors
    encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[], [accounts[1].address]]);
    const updatePolicyTx = await policyManager.updatePolicySettingsForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );
    txReceipt = await ethers.provider.getTransactionReceipt(updatePolicyTx.hash);
    expect(txReceipt.status).to.equal(1);
  });

  it('Should not be able to update a policy which is not enabled for the fund', async function () {
    await expect(
      policyManager.updatePolicySettingsForFund(comptrollerProxy, contracts.MinMaxInvestment, '0x'),
    ).to.be.revertedWith('onlyEnabledPolicyForFund: Policy not enabled');
  });

  it('Should be able to Disable a Policy for a Vault', async function () {
    // Enabling the InvestorWhitelist Policy
    await policyManager.registerPolicies([contracts.InvestorWhitelist]);
    const encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address, accounts[1].address], []]);
    const enablePolicyTx = await policyManager.enablePolicyForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );
    let txReceipt = await ethers.provider.getTransactionReceipt(enablePolicyTx.hash);
    expect(txReceipt.status).to.equal(1);

    const disablePolicyTx = await policyManager.disablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist);
    txReceipt = await ethers.provider.getTransactionReceipt(disablePolicyTx.hash);
    expect(txReceipt.status).to.equal(1);
    expect(await policyManager.policyIsEnabledForFund(comptrollerProxy, contracts.InvestorWhitelist)).to.be.false;
  });

  it('Should not be able to disable a policy which is not enabled for the fund', async function () {
    await expect(policyManager.disablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist)).to.be.revertedWith(
      'onlyEnabledPolicyForFund: Policy not enabled',
    );
  });

  it('Should emit enable and disable policy for fund event', async function () {
    // Enabling the InvestorWhitelist Policy
    await policyManager.registerPolicies([contracts.InvestorWhitelist]);
    const encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address, accounts[1].address], []]);
    const enablePolicyTx = await policyManager.enablePolicyForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );
    let txReceipt = await enablePolicyTx.wait();
    expect(txReceipt.events[1].event).to.be.equals('PolicyEnabledForFund');

    // Disabling the InvestorWhitelist policy
    const disablePolicyTx = await policyManager.disablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist);
    txReceipt = await disablePolicyTx.wait();
    expect(txReceipt.events[0].event).to.be.equals('PolicyDisabledForFund');
  });
});
