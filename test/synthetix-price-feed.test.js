/* eslint-disable @typescript-eslint/no-var-requires */
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { utils } = require('ethers');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { filterEventsByABI } = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let accounts;
let deployer;
let contracts;
let abiCoder;
let synthetixPriceFeed;
let mockSynthetixToken1;
let mockSynthetixToken2;

// Events
const synthAddedEventABI = 'event SynthAdded(address indexed synth, bytes32 currencyKey)';
const currencyKeyUpdatedEventABI =
  'event SynthCurrencyKeyUpdated(address indexed synth,bytes32 prevCurrencyKey,bytes32 nextCurrencyKey)';

beforeEach(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  abiCoder = new utils.AbiCoder();

  // Creating Synthetix Tokens for test
  const MockSynthetixToken = await hre.ethers.getContractFactory('MockSynthetixToken', deployer);
  mockSynthetixToken1 = await MockSynthetixToken.deploy(
    'Synth Test 1',
    'sTEST1',
    18,
    abiCoder.encode(['uint256'], [1]),
  );
  await mockSynthetixToken1.deployed();
  mockSynthetixToken2 = await MockSynthetixToken.deploy(
    'Synth Test 2',
    'sTEST2',
    18,
    abiCoder.encode(['uint256'], [2]),
  );
  await mockSynthetixToken2.deployed();

  const SynthetixPriceFeed = await hre.ethers.getContractFactory('SynthetixPriceFeed');
  synthetixPriceFeed = SynthetixPriceFeed.attach(contracts.SynthetixPriceFeed);
});

describe('SynthetixPriceFeed Test Suite', async function () {
  describe('addSynths Tests', function () {
    it('Should be able to add synths', async function () {
      const addTx = await synthetixPriceFeed.addSynths([mockSynthetixToken1.address]);
      const addReceipt = await addTx.wait();
      const synthAddedEvents = filterEventsByABI(addReceipt, [synthAddedEventABI]);
      expect(synthAddedEvents.length).to.equal(1);
      const synthAddedEvent = synthAddedEvents[0].args;
      expect(synthAddedEvent.synth).to.equal(mockSynthetixToken1.address);
      expect(synthAddedEvent.currencyKey).to.equal(await mockSynthetixToken1.currencyKey());
    });
    it('Only FundDeployer owner can call', async function () {
      await expect(synthetixPriceFeed.connect(accounts[1]).addSynths([mockSynthetixToken1.address])).to.revertedWith(
        'onlyFundDeployerOwner',
      );
    });
    it('synths should not be empty', async function () {
      await expect(synthetixPriceFeed.addSynths([])).to.revertedWith('addSynths: Empty _synths');
    });
    it('Should not be able to add if added', async function () {
      await synthetixPriceFeed.addSynths([mockSynthetixToken1.address]);
      await expect(synthetixPriceFeed.addSynths([mockSynthetixToken1.address])).to.revertedWith(
        '__addSynths: Value already set',
      );
    });
    it('Revert if currencyKey of synth is 0', async function () {
      await mockSynthetixToken1.setCurrencyKey(abiCoder.encode(['uint256'], [0]));
      await expect(synthetixPriceFeed.addSynths([mockSynthetixToken1.address])).to.revertedWith(
        '__addSynths: No currencyKey',
      );
    });
  });
  describe('updateSynthCurrencyKeys Tests', function () {
    beforeEach(async function () {
      // Ading synth to test the updateSynthCurrencyKeys
      await synthetixPriceFeed.addSynths([mockSynthetixToken1.address]);
    });
    it('Should be able to update currencyKey of synths', async function () {
      const oldCurrencyKey = await mockSynthetixToken1.currencyKey();
      const newCurrencyKey = abiCoder.encode(['uint256'], [11]);
      await mockSynthetixToken1.setCurrencyKey(newCurrencyKey);
      const updateTx = await synthetixPriceFeed.updateSynthCurrencyKeys([mockSynthetixToken1.address]);
      const updateReceipt = await updateTx.wait();
      const updatedEvents = filterEventsByABI(updateReceipt, [currencyKeyUpdatedEventABI]);
      expect(updatedEvents.length).to.equal(1);
      const updateEvent = updatedEvents[0].args;
      expect(updateEvent.synth).to.equal(mockSynthetixToken1.address);
      expect(updateEvent.prevCurrencyKey).to.equal(oldCurrencyKey);
      expect(updateEvent.nextCurrencyKey).to.equal(newCurrencyKey);
    });
    it('synths should not be empty', async function () {
      await expect(synthetixPriceFeed.updateSynthCurrencyKeys([])).to.revertedWith(
        'updateSynthCurrencyKeys: Empty _synths',
      );
    });
    it('Should not be able to update if not added', async function () {
      await expect(synthetixPriceFeed.updateSynthCurrencyKeys([mockSynthetixToken2.address])).to.revertedWith(
        'updateSynthCurrencyKeys: Synth not set',
      );
    });
    it('Should not be able to update using same currencyKey', async function () {
      await expect(synthetixPriceFeed.updateSynthCurrencyKeys([mockSynthetixToken1.address])).to.revertedWith(
        'updateSynthCurrencyKeys: Synth has correct currencyKey',
      );
    });
  });
  describe('calcUnderlyingValues tests', function () {
    let mockSynthetixPriceSource;
    beforeEach(async function () {
      // Adding synths
      await synthetixPriceFeed.addSynths([mockSynthetixToken1.address]);

      const MockSynthetixPriceSource = await hre.ethers.getContractFactory('MockSynthetixPriceSource');
      mockSynthetixPriceSource = MockSynthetixPriceSource.attach(contracts.mockContracts.MockSynthetixPriceSource);
      // Setting fixed rate for mockSynthetixToken's currencyKey
      const mockSynthetixToken1CurrencyKey = await mockSynthetixToken1.currencyKey();
      await mockSynthetixPriceSource.setRate(mockSynthetixToken1CurrencyKey, utils.parseEther('1'));
    });
    it('Should be able to calculate underlying values of a derivative', async function () {
      await expect(synthetixPriceFeed.calcUnderlyingValues(mockSynthetixToken1.address, utils.parseEther('1'))).to.be
        .not.reverted;
    });
    it('Revert if synth is not added', async function () {
      await expect(
        synthetixPriceFeed.calcUnderlyingValues(mockSynthetixToken2.address, utils.parseEther('1')),
      ).to.revertedWith('calcUnderlyingValues: _derivative is not supported');
    });
    it('Revert if invalid Rate', async function () {
      // Setting fixed rate as 0 to make it invalid
      await mockSynthetixPriceSource.setRate(await mockSynthetixToken1.currencyKey(), 0);
      await expect(
        synthetixPriceFeed.calcUnderlyingValues(mockSynthetixToken1.address, utils.parseEther('1')),
      ).to.revertedWith('calcUnderlyingValues: _derivative rate is not valid');
    });
  });
  describe('State getter tests', function () {
    beforeEach(async function () {
      // Adding synths
      await synthetixPriceFeed.addSynths([mockSynthetixToken1.address]);
    });
    it('Should be able to check supported synths', async function () {
      expect(await synthetixPriceFeed.isSupportedAsset(mockSynthetixToken1.address)).to.be.true;
      expect(await synthetixPriceFeed.isSupportedAsset(mockSynthetixToken2.address)).to.be.false;
    });
    it('can get the Address Resolver address', async function () {
      expect(await synthetixPriceFeed.getAddressResolver()).to.equal(contracts.mockContracts.MockSynthetixIntegratee);
    });
    it('can get the list of currencyKeys of synths', async function () {
      const currencyKeys = await synthetixPriceFeed.getCurrencyKeysForSynths([mockSynthetixToken1.address]);
      expect(currencyKeys.length).to.equal(1);
      expect(currencyKeys[0]).equal(await mockSynthetixToken1.currencyKey());
    });
    it('can get the currencyKey of a synth', async function () {
      expect(await synthetixPriceFeed.getCurrencyKeyForSynth(mockSynthetixToken1.address)).to.equal(
        await mockSynthetixToken1.currencyKey(),
      );
    });
    it('can get the sUSD address', async function () {
      expect(await synthetixPriceFeed.getSUSD()).to.equal(contracts.mockContracts.MockSynthetixToken);
    });
  });
});
