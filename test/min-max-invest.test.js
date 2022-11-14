/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { emptyConfigData, getFundAddresses, filterEventsByABI, filterEvents } = require('./utils/fndz-utilities.js');

/* eslint-enable @typescript-eslint/no-var-requires */

let contractAddresses;
let accounts;
let deployer;
let minMaxInvestment;
let policyManager;
let comptrollerProxy;
let fndzController;
let mockBUSD;

beforeEach(async function () {
  // runs before each test in this block

  contractAddresses = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];

  const MinMaxInvestment = await ethers.getContractFactory('MinMaxInvestment', deployer);
  minMaxInvestment = MinMaxInvestment.attach(contractAddresses.MinMaxInvestment);

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contractAddresses.FNDZController);

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  mockBUSD = MockToken.attach(contractAddresses.mockTokens.MockBUSD);
  expect(mockBUSD).to.be.an('object');

  const newFundTx = await fndzController.createNewFund(
    deployer.address,
    'MINMAX Fund',
    mockBUSD.address,
    '1',
    emptyConfigData,
    emptyConfigData,
  );
  const newFundReceipt = await newFundTx.wait();
  ({ comptrollerProxy } = getFundAddresses(newFundReceipt));

  const PolicyManager = await ethers.getContractFactory('PolicyManager', deployer);
  policyManager = PolicyManager.attach(contractAddresses.PolicyManager);
});

describe('MinMaxInvestment Tests', function () {
  it('sets state vars', async () => {
    const getPolicyManagerCall = await minMaxInvestment.getPolicyManager();
    expect(getPolicyManagerCall).to.equal(policyManager.address);
  });

  it('should return the identifier', async () => {
    const txn = await minMaxInvestment.identifier();
    expect(txn).to.equal('MIN_MAX_INVESTMENT');
  });

  it('addFundSettings can only be called by the PolicyManager', async () => {
    const minInvestmentAmount = ethers.utils.parseEther('1');
    const maxInvestmentAmount = ethers.utils.parseEther('2');
    var encodedData = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [minInvestmentAmount, maxInvestmentAmount],
    );

    await expect(minMaxInvestment.addFundSettings(comptrollerProxy, encodedData)).to.be.revertedWith(
      'Only the PolicyManager can make this call',
    );
  });

  it('does not allow minInvestmentAmount to be greater than or equal to maxInvestmentAmount unless maxInvestmentAmount is 0', async () => {
    let minInvestmentAmount = ethers.utils.parseEther('1');
    let maxInvestmentAmount = ethers.utils.parseEther('1');
    var minMaxInvestmentSettings = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [minInvestmentAmount, maxInvestmentAmount],
    );

    var policyManagerConfig = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'bytes[]'],
      [[minMaxInvestment.address], [minMaxInvestmentSettings]],
    );
    await expect(policyManager.setConfigForFund(policyManagerConfig)).to.be.revertedWith(
      'minInvestmentAmount must be less than maxInvestmentAmount',
    );

    minInvestmentAmount = ethers.utils.parseEther('2');
    maxInvestmentAmount = ethers.utils.parseEther('1');
    var minMaxInvestmentSettings = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [minInvestmentAmount, maxInvestmentAmount],
    );

    var policyManagerConfig = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'bytes[]'],
      [[minMaxInvestment.address], [minMaxInvestmentSettings]],
    );
    await expect(policyManager.setConfigForFund(policyManagerConfig)).to.be.revertedWith(
      'minInvestmentAmount must be less than maxInvestmentAmount',
    );
  });

  it('updateFundSettings can only be called by the policy manager', async () => {
    const minInvestmentAmount = ethers.utils.parseEther('1');
    const maxInvestmentAmount = ethers.utils.parseEther('2');
    var encodedData = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [minInvestmentAmount, maxInvestmentAmount],
    );

    await expect(
      minMaxInvestment.updateFundSettings(comptrollerProxy, ethers.Wallet.createRandom().address, encodedData),
    ).to.be.revertedWith('Only the PolicyManager can make this call');
  });

  it('returns false if the investmentAmount is out of bounds', async () => {
    const minInvestmentAmount = ethers.utils.parseEther('1');
    const maxInvestmentAmount = ethers.utils.parseEther('2');
    var minMaxInvestmentSettings = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [minInvestmentAmount, maxInvestmentAmount],
    );
    var policyManagerConfig = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'bytes[]'],
      [[minMaxInvestment.address], [minMaxInvestmentSettings]],
    );

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'MINMAX Fund',
      mockBUSD.address,
      '1',
      emptyConfigData,
      policyManagerConfig,
    );
    const newFundReceipt = await newFundTx.wait();
    const { comptrollerProxy: _comptrollerProxy } = getFundAddresses(newFundReceipt);

    var encodedData = ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'uint256'],
      [ethers.Wallet.createRandom().address, 0, ethers.utils.parseEther('3'), 1],
    );
    const validateRuleCall = await minMaxInvestment.callStatic.validateRule(
      _comptrollerProxy,
      ethers.Wallet.createRandom().address,
      1,
      encodedData,
    );
    expect(validateRuleCall).to.be.false;
  });

  it('Should able to create new fund with MaxInvestmentAmount 0', async () => {
    const minInvestmentAmount = ethers.utils.parseEther('2');
    const maxInvestmentAmount = ethers.utils.parseEther('0');
    var minMaxInvestmentSettings = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [minInvestmentAmount, maxInvestmentAmount],
    );
    var policyManagerConfig = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'bytes[]'],
      [[minMaxInvestment.address], [minMaxInvestmentSettings]],
    );

    const fundTx = await fndzController.createNewFund(
      deployer.address,
      'MINMAX Fund',
      mockBUSD.address,
      '1',
      emptyConfigData,
      policyManagerConfig,
    );
    const txReceipt = await fundTx.wait();
    expect(txReceipt.status).to.equal(1);
  });

  it('can create a new fund with this policy, and it can disable and re-enable the policy for that fund', async () => {
    // declare variables for policy config
    let minInvestmentAmount = ethers.utils.parseEther('1');
    let maxInvestmentAmount = ethers.utils.parseEther('2');
    var minMaxInvestmentSettings = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [minInvestmentAmount, maxInvestmentAmount],
    );

    var policyManagerConfig = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'bytes[]'],
      [[minMaxInvestment.address], [minMaxInvestmentSettings]],
    );

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'MINMAX Fund',
      mockBUSD.address,
      '1',
      emptyConfigData,
      policyManagerConfig,
    );
    const newFundReceipt = await newFundTx.wait();
    const { comptrollerProxy: comptrollerAddress } = getFundAddresses(newFundReceipt);

    comptrollerProxy = comptrollerAddress;

    //confirm the policy has been enabled on fund creation
    const confirmEnabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerAddress);

    expect(confirmEnabledPolicies.length).to.equal(1);
    expect(confirmEnabledPolicies[0]).to.equal(minMaxInvestment.address);

    await policyManager.disablePolicyForFund(comptrollerAddress, minMaxInvestment.address);
    const confirmDisabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerAddress);
    expect(confirmDisabledPolicies).to.deep.equal([]);

    // re-enable policy with empty settingsData
    minInvestmentAmount = ethers.utils.parseEther('3');
    maxInvestmentAmount = ethers.utils.parseEther('4');
    var reEnableMinMaxInvestmentConfig = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [minInvestmentAmount, maxInvestmentAmount],
    );

    //Internally calls addFundSettings
    const fundSettingsTxReceipt = await policyManager.enablePolicyForFund(
      comptrollerAddress,
      minMaxInvestment.address,
      reEnableMinMaxInvestmentConfig,
    );
    const txReceipt = await fundSettingsTxReceipt.wait();

    const fundEnabledEvents = filterEventsByABI(txReceipt, [
      'event PolicyEnabledForFund(address indexed comptrollerProxy,address indexed policy,bytes settingsData)',
    ]);
    expect(fundEnabledEvents.length).to.equal(1);
    expect(comptrollerAddress).to.equal(fundEnabledEvents[0].args.comptrollerProxy);
    expect(reEnableMinMaxInvestmentConfig).to.equal(fundEnabledEvents[0].args.settingsData);

    // confirm that the policy has been re-enabled for fund
    const confirmReEnabledPolicies = await policyManager.getEnabledPoliciesForFund(comptrollerAddress);
    expect(confirmReEnabledPolicies[0]).to.equal(minMaxInvestment.address);
    const confirmFundSettings = await minMaxInvestment.getFundSettings(comptrollerAddress);
    expect(confirmFundSettings[0]).to.equal(minInvestmentAmount);
    expect(confirmFundSettings[1]).to.equal(maxInvestmentAmount);
  });

  it('Vault test with min investment of 1 and a max of 2', async () => {
    const minInvestmentAmount = ethers.utils.parseEther('1');
    const maxInvestmentAmount = ethers.utils.parseEther('2');
    var minMaxInvestmentSettings = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [minInvestmentAmount, maxInvestmentAmount],
    );

    var policyManagerConfig = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'bytes[]'],
      [[minMaxInvestment.address], [minMaxInvestmentSettings]],
    );

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'MINMAX Fund',
      mockBUSD.address,
      '1',
      emptyConfigData,
      policyManagerConfig,
    );
    const newFundReceipt = await newFundTx.wait();

    const { comptrollerProxy } = getFundAddresses(newFundReceipt);

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    const comptroller = ComptrollerLib.attach(comptrollerProxy);
    expect(comptroller).to.be.an('object');
    //set approve amount
    await mockBUSD.mintFor(accounts[1].address, ethers.BigNumber.from('10000000000000000000000'));
    var approveAmount = ethers.utils.parseEther('100');
    await mockBUSD.connect(accounts[1]).approve(comptroller.address, approveAmount);

    // With investment  of 0.99
    var depositAmount = ethers.utils.parseEther('1').sub(1);
    await expect(
      comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero),
    ).to.be.revertedWith('Rule evaluated to false: MIN_MAX_INVESTMENT');

    // With investment  of 1
    depositAmount = ethers.utils.parseEther('1');
    var buySharesTx = await comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    var buySharesReceipt = await buySharesTx.wait();

    var sharesBoughtEvents = filterEvents(buySharesReceipt, 'SharesBought');
    expect(sharesBoughtEvents.length).to.equal(1);

    // With investment  of 1.99
    depositAmount = ethers.utils.parseEther('2').sub(1);
    buySharesTx = await comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    buySharesReceipt = await buySharesTx.wait();
    sharesBoughtEvents = filterEvents(buySharesReceipt, 'SharesBought');
    expect(sharesBoughtEvents.length).to.equal(1);

    // With investment  of 2
    depositAmount = ethers.utils.parseEther('2');
    buySharesTx = await comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    buySharesReceipt = await buySharesTx.wait();
    sharesBoughtEvents = filterEvents(buySharesReceipt, 'SharesBought');
    expect(sharesBoughtEvents.length).to.equal(1);

    // With investment  of 2.01
    depositAmount = ethers.utils.parseEther('2').add(1);
    await expect(
      comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero),
    ).to.be.revertedWith('Rule evaluated to false: MIN_MAX_INVESTMENT');
  });

  it('Vault test with min investment of 0 and a max of 2', async () => {
    const minInvestmentAmount = ethers.utils.parseEther('0');
    const maxInvestmentAmount = ethers.utils.parseEther('2');
    var minMaxInvestmentSettings = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [minInvestmentAmount, maxInvestmentAmount],
    );

    var policyManagerConfig = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'bytes[]'],
      [[minMaxInvestment.address], [minMaxInvestmentSettings]],
    );

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'MINMAX Fund',
      mockBUSD.address,
      '1',
      emptyConfigData,
      policyManagerConfig,
    );
    const newFundReceipt = await newFundTx.wait();

    const { comptrollerProxy } = getFundAddresses(newFundReceipt);

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    const comptroller = ComptrollerLib.attach(comptrollerProxy);
    expect(comptroller).to.be.an('object');
    //set approve amount
    await mockBUSD.mintFor(accounts[1].address, ethers.BigNumber.from('10000000000000000000000'));
    var approveAmount = ethers.utils.parseEther('100');
    await mockBUSD.connect(accounts[1]).approve(comptroller.address, approveAmount);

    // With investment  of 0.01
    var depositAmount = ethers.BigNumber.from('1');
    var buySharesTx = await comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    var buySharesReceipt = await buySharesTx.wait();
    var sharesBoughtEvents = filterEvents(buySharesReceipt, 'SharesBought');
    expect(sharesBoughtEvents.length).to.equal(1);

    // With investment  of 1
    depositAmount = ethers.utils.parseEther('1');
    buySharesTx = await comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    buySharesReceipt = await buySharesTx.wait();
    sharesBoughtEvents = filterEvents(buySharesReceipt, 'SharesBought');
    expect(sharesBoughtEvents.length).to.equal(1);

    // With investment  of 1.99
    depositAmount = ethers.utils.parseEther('2').sub(1);
    buySharesTx = await comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    buySharesReceipt = await buySharesTx.wait();
    sharesBoughtEvents = filterEvents(buySharesReceipt, 'SharesBought');
    expect(sharesBoughtEvents.length).to.equal(1);

    // With investment  of 2.01
    depositAmount = ethers.utils.parseEther('2').add(1);
    await expect(
      comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero),
    ).to.be.revertedWith('Rule evaluated to false: MIN_MAX_INVESTMENT');
  });

  it('Vault test with min investment of 1 and a max of 0', async () => {
    const minInvestmentAmount = ethers.utils.parseEther('1');
    const maxInvestmentAmount = ethers.utils.parseEther('0');
    var minMaxInvestmentSettings = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [minInvestmentAmount, maxInvestmentAmount],
    );

    var policyManagerConfig = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'bytes[]'],
      [[minMaxInvestment.address], [minMaxInvestmentSettings]],
    );

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'MINMAX Fund',
      mockBUSD.address,
      '1',
      emptyConfigData,
      policyManagerConfig,
    );
    const newFundReceipt = await newFundTx.wait();

    const { comptrollerProxy } = getFundAddresses(newFundReceipt);

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    const comptroller = ComptrollerLib.attach(comptrollerProxy);
    expect(comptroller).to.be.an('object');
    //set approve amount
    await mockBUSD.mintFor(accounts[1].address, ethers.BigNumber.from('10000000000000000000000'));
    var approveAmount = ethers.utils.parseEther('100');
    await mockBUSD.connect(accounts[1]).approve(comptroller.address, approveAmount);

    // With investment  of 0.99
    depositAmount = ethers.utils.parseEther('1').sub(1);
    await expect(
      comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero),
    ).to.be.revertedWith('Rule evaluated to false: MIN_MAX_INVESTMENT');

    // With investment  of 1
    var depositAmount = ethers.utils.parseEther('1');
    var buySharesTx = await comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    var buySharesReceipt = await buySharesTx.wait();
    var sharesBoughtEvents = filterEvents(buySharesReceipt, 'SharesBought');
    expect(sharesBoughtEvents.length).to.equal(1);

    // With investment  of 2
    depositAmount = ethers.utils.parseEther('2');
    buySharesTx = await comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    buySharesReceipt = await buySharesTx.wait();
    sharesBoughtEvents = filterEvents(buySharesReceipt, 'SharesBought');
    expect(sharesBoughtEvents.length).to.equal(1);

    // With investment  of 3
    depositAmount = ethers.utils.parseEther('3');
    buySharesTx = await comptroller.connect(accounts[1]).buyShares(depositAmount, 0, ethers.constants.AddressZero);
    buySharesReceipt = await buySharesTx.wait();
    sharesBoughtEvents = filterEvents(buySharesReceipt, 'SharesBought');
    expect(sharesBoughtEvents.length).to.equal(1);
  });
});
