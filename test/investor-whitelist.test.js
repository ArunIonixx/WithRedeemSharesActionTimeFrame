/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { utils, BigNumber } = require('ethers');
const { deployments } = require('./utils/deploy-test-contracts.js');
const {
  emptyConfigData,
  getFundAddresses,
  filterEventsByABI,
  createRandomAddress,
} = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let abiCoder;
let investorWhitelist;
let policyManager;
let comptrollerProxy;
let comptroller;
let mockBUSDToken;

beforeEach(async function () {
  // runs before each test in this block
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  abiCoder = new utils.AbiCoder();
  const InvestorWhitelist = await ethers.getContractFactory('InvestorWhitelist', deployer);
  investorWhitelist = InvestorWhitelist.attach(contracts.InvestorWhitelist);
  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  const fndzController = FNDZController.attach(contracts.FNDZController);
  expect(fndzController).to.be.an('object');

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  mockBUSDToken = MockToken.attach(contracts.mockTokens.MockBUSD);
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
  ({ comptrollerProxy } = getFundAddresses(receipt));

  const PolicyManager = await ethers.getContractFactory('PolicyManager', deployer);
  policyManager = PolicyManager.attach(contracts.PolicyManager);
  expect(policyManager).to.be.an('object');

  const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
  comptroller = ComptrollerLib.attach(comptrollerProxy);

  await mockBUSDToken.mintFor(accounts[1].address, BigNumber.from('10000000000000000000000'));
  await mockBUSDToken.mintFor(deployer.address, BigNumber.from('10000000000000000000000'));
});

describe('Investor Whitelist Test Cases', function () {
  ////////////////////////////////////////////
  //Independent InvestorWhitelist Test Cases//
  ////////////////////////////////////////////

  it('should return the identifier', async () => {
    const txn = await investorWhitelist.identifier();
    expect(txn).to.equal('INVESTOR_WHITELIST');
  });

  it('should return if an address passes the policy rule', async () => {
    //Random Address Creation
    let randomAddress = await createRandomAddress();
    randomAddress = randomAddress.address;

    let txn = await investorWhitelist.passesRule(comptrollerProxy, randomAddress);
    expect(txn).to.equal(false);

    const encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[randomAddress], []]);
    txn = await policyManager.enablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings);
    const receipts = await ethers.provider.getTransactionReceipt(txn.hash);
    expect(receipts.status).to.equal(1);

    //check the condition
    txn = await investorWhitelist.passesRule(comptrollerProxy, randomAddress);
    expect(txn).to.equal(true);
  });

  ///////////////////////////////////////////////////////
  //Policy Manager related InvestorWhitelist Test Cases//
  ///////////////////////////////////////////////////////

  it('should not allow addFundSettings to be called directly', async () => {
    const encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address], []]);
    await expect(investorWhitelist.addFundSettings(comptrollerProxy, encodedSettings)).to.be.revertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('should not allow updateFundSettings to be called directly', async () => {
    //Adding a policy with adding a whitelist address
    let encodedSettings = abiCoder.encode(
      ['address[]', 'address[]'],
      [[deployer.address, accounts[1].address], [accounts[1].address]],
    );
    let txn = await policyManager.enablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings);
    const receipts = await ethers.provider.getTransactionReceipt(txn.hash);
    expect(receipts.status).to.equal(1);

    txn = await investorWhitelist.passesRule(comptrollerProxy, deployer.address);
    expect(txn).to.equal(true);
    txn = await investorWhitelist.passesRule(comptrollerProxy, accounts[1].address);
    expect(txn).to.equal(false);

    //Updating a policy with adding a whitelist address
    encodedSettings = abiCoder.encode(
      ['address[]', 'address[]'],
      [[accounts[1].address, accounts[2].address], [deployer.address]],
    );
    await expect(
      investorWhitelist.updateFundSettings(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings),
    ).to.be.revertedWith('Only the PolicyManager can make this call');
  });

  it('should not allow an unauthorized user to call enablePolicyForFund for a vault that they do not own', async () => {
    const encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address], []]);
    await expect(
      policyManager
        .connect(accounts[1])
        .enablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings),
    ).to.be.revertedWith('Only the fund owner can call this function');
  });

  it('should allow an address to be added and removed in the same call', async () => {
    let txn = await investorWhitelist.passesRule(comptrollerProxy, deployer.address);
    expect(txn).to.equal(false);
    const encodedSettings = abiCoder.encode(
      ['address[]', 'address[]'],
      [[deployer.address, accounts[1].address], [accounts[1].address]],
    );
    txn = await policyManager.enablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings);
    const receipts = await ethers.provider.getTransactionReceipt(txn.hash);
    expect(receipts.status).to.equal(1);

    txn = await investorWhitelist.passesRule(comptrollerProxy, deployer.address);
    expect(txn).to.equal(true);

    txn = await investorWhitelist.passesRule(comptrollerProxy, accounts[1].address);
    expect(txn).to.equal(false);
  });

  it('should not allow an already whitelisted address to be added again', async () => {
    // can't have duplicate addresses in single call
    let encodedSettings = abiCoder.encode(
      ['address[]', 'address[]'],
      [[deployer.address, accounts[1].address, accounts[1].address], []],
    );
    await expect(
      policyManager.enablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings),
    ).to.be.revertedWith('__addToList: Address already exists in list');

    encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address], []]);
    await policyManager.enablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings);
    const passesRule = await investorWhitelist.passesRule(comptrollerProxy, deployer.address);
    expect(passesRule).to.equal(true);

    // can't add already added address
    await expect(
      policyManager.updatePolicySettingsForFund(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings),
    ).to.be.revertedWith('__addToList: Address already exists in list');
  });

  it('should not allow an address to be removed if it is not already whitelisted', async () => {
    const encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address], [accounts[1].address]]);
    await expect(
      policyManager.enablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings),
    ).to.be.revertedWith('__removeFromList: Address does not exist in list');
  });

  it('should enable and update a whitelist policy with add and remove the address in the whitelist', async () => {
    //Adding a policy with adding a whitelist address
    let encodedSettings = abiCoder.encode(
      ['address[]', 'address[]'],
      [[deployer.address, accounts[1].address], [accounts[1].address]],
    );
    let txn = await policyManager.enablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings);
    let receipts = await ethers.provider.getTransactionReceipt(txn.hash);
    expect(receipts.status).to.equal(1);
    txn = await investorWhitelist.passesRule(comptrollerProxy, deployer.address);
    expect(txn).to.equal(true);
    txn = await investorWhitelist.passesRule(comptrollerProxy, accounts[1].address);
    expect(txn).to.equal(false);

    //Updating a policy with adding a whitelist address
    encodedSettings = abiCoder.encode(
      ['address[]', 'address[]'],
      [[accounts[1].address, accounts[2].address], [deployer.address]],
    );
    txn = await policyManager.updatePolicySettingsForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );
    receipts = await ethers.provider.getTransactionReceipt(txn.hash);
    expect(receipts.status).to.equal(1);

    txn = await investorWhitelist.passesRule(comptrollerProxy, deployer.address);
    expect(txn).to.equal(false);
    txn = await investorWhitelist.passesRule(comptrollerProxy, accounts[2].address);
    expect(txn).to.equal(true);
    txn = await investorWhitelist.passesRule(comptrollerProxy, accounts[1].address);
    expect(txn).to.equal(true);
  });

  it('should emit AddressesAdded and AddressesRemoved events', async function () {
    //Address added and removed in the whitelist
    const encodedSettings = abiCoder.encode(
      ['address[]', 'address[]'],
      [[deployer.address, accounts[1].address], [accounts[1].address]],
    );
    const enablePolicyTx = await policyManager.enablePolicyForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );

    //Events emitted check with the value
    const txReceipt = await enablePolicyTx.wait();
    const addressAddedEvents = filterEventsByABI(txReceipt, [
      'event AddressesAdded(address indexed comptrollerProxy, address[] items)',
    ]);
    expect(addressAddedEvents[0].args.items).to.eql([deployer.address, accounts[1].address]);
    const addressRemovedEvents = filterEventsByABI(txReceipt, [
      'event AddressesRemoved(address indexed comptrollerProxy, address[] items)',
    ]);
    expect(addressRemovedEvents[0].args.items).to.eql([accounts[1].address]);
    let txn = await investorWhitelist.passesRule(comptrollerProxy, deployer.address);
    expect(txn).to.equal(true);
    txn = await investorWhitelist.passesRule(comptrollerProxy, accounts[1].address);
    expect(txn).to.equal(false);
  });

  it('should prevent non-whitelisted addresses from calling buyShares', async function () {
    // deployer and account1 buy shares
    await mockBUSDToken.connect(accounts[1]).approve(comptrollerProxy, '1000');
    await mockBUSDToken.approve(comptrollerProxy, '1000');
    const depositAmount = '100';
    let buyShareResult = await comptroller.buyShares(depositAmount, 0, ethers.constants.AddressZero);
    let receipts = await ethers.provider.getTransactionReceipt(buyShareResult.hash);
    expect(receipts.status).to.equal(1);

    buyShareResult = await comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    receipts = await ethers.provider.getTransactionReceipt(buyShareResult.hash);
    expect(receipts.status).to.equal(1);

    //enablePolicy with no addresses
    let encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[], []]);
    let txn = await policyManager.enablePolicyForFund(comptrollerProxy, contracts.InvestorWhitelist, encodedSettings);
    receipts = await ethers.provider.getTransactionReceipt(txn.hash);
    expect(receipts.status).to.equal(1);

    //deployer and account1 cannot buy shares
    await expect(comptroller.buyShares(depositAmount, 0, ethers.constants.AddressZero)).to.be.revertedWith(
      'Rule evaluated to false: INVESTOR_WHITELIST',
    );
    await expect(
      comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero),
    ).to.be.revertedWith('Rule evaluated to false: INVESTOR_WHITELIST');

    //updatePolicy to add deployer
    encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address], []]);
    txn = await policyManager.updatePolicySettingsForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );
    receipts = await ethers.provider.getTransactionReceipt(txn.hash);
    expect(receipts.status).to.equal(1);

    //deployer can buy shares, account1 cannot buy shares
    buyShareResult = await comptroller.buyShares(depositAmount, 0, ethers.constants.AddressZero);
    receipts = await ethers.provider.getTransactionReceipt(buyShareResult.hash);
    expect(receipts.status).to.equal(1);

    await expect(
      comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero),
    ).to.be.revertedWith('Rule evaluated to false: INVESTOR_WHITELIST');

    //updatePolicy to add account1 and remove deployer
    encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[accounts[1].address], [deployer.address]]);
    txn = await policyManager.updatePolicySettingsForFund(
      comptrollerProxy,
      contracts.InvestorWhitelist,
      encodedSettings,
    );
    receipts = await ethers.provider.getTransactionReceipt(txn.hash);
    expect(receipts.status).to.equal(1);

    //deployer cannot buy shares, account1 can buy shares
    buyShareResult = await comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    receipts = await ethers.provider.getTransactionReceipt(buyShareResult.hash);
    expect(receipts.status).to.equal(1);

    await expect(comptroller.buyShares(depositAmount, 0, ethers.constants.AddressZero)).to.be.revertedWith(
      'Rule evaluated to false: INVESTOR_WHITELIST',
    );

    //final state of the whitelist
    txn = await investorWhitelist.passesRule(comptrollerProxy, deployer.address);
    expect(txn).to.equal(false);
    txn = await investorWhitelist.passesRule(comptrollerProxy, accounts[1].address);
    expect(txn).to.equal(true);
  });

  it('Should be able to get the list of whitelisted addresses', async function () {
    //Updating a policy with adding a whitelist address
    const encodedSettings = abiCoder.encode(['address[]', 'address[]'], [[deployer.address, accounts[1].address], []]);
    await policyManager.enablePolicyForFund(comptroller.address, contracts.InvestorWhitelist, encodedSettings);

    const whitelistedAddresses = await investorWhitelist.getList(comptroller.address);
    expect(whitelistedAddresses.length).to.equal(2);
    expect(whitelistedAddresses).to.contain(deployer.address);
    expect(whitelistedAddresses).to.contain(accounts[1].address);
  });
});
