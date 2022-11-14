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
let aggregatedDerivativePriceFeed;
let synthetixPriceFeed;
let mockSynthetixToken1;
let mockSynthetixToken2;

// Event ABIs
const DerivativeAddedEventABI = 'event DerivativeAdded(address indexed derivative, address priceFeed)';
const DerivativeRemovedEventABI = 'event DerivativeRemoved(address indexed derivative)';
const DerivativeUpdatedEventABI =
  'event DerivativeUpdated(address indexed derivative,address prevPriceFeed,address nextPriceFeed)';

beforeEach(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];

  // Creating Synthetix Tokens for test
  const MockSynthetixToken = await hre.ethers.getContractFactory('MockSynthetixToken');
  mockSynthetixToken1 = await MockSynthetixToken.deploy(
    'Synth Test 1',
    'sTEST1',
    18,
    '0x0000000000000000000000000000000000000000000000000000000000000001',
  );
  await mockSynthetixToken1.deployed();
  mockSynthetixToken2 = await MockSynthetixToken.deploy(
    'Synth Test 2',
    'sTEST2',
    18,
    '0x0000000000000000000000000000000000000000000000000000000000000002',
  );
  await mockSynthetixToken2.deployed();

  const SynthetixPriceFeed = await hre.ethers.getContractFactory('SynthetixPriceFeed');
  synthetixPriceFeed = SynthetixPriceFeed.attach(contracts.SynthetixPriceFeed);

  // Adding synth
  await synthetixPriceFeed.addSynths([mockSynthetixToken1.address, mockSynthetixToken2.address]);

  const AggregatedDerivativePriceFeed = await ethers.getContractFactory('AggregatedDerivativePriceFeed', deployer);
  aggregatedDerivativePriceFeed = await AggregatedDerivativePriceFeed.deploy(
    contracts.FundDeployer,
    [mockSynthetixToken1.address],
    [synthetixPriceFeed.address],
  );
  await aggregatedDerivativePriceFeed.deployed();
});

describe('AggregatedDerivativePriceFeed Test Suite', function () {
  describe('addDerivatives tests', function () {
    it('Should be able to add derivatives and price feeds', async function () {
      const addTx = await aggregatedDerivativePriceFeed.addDerivatives(
        [mockSynthetixToken2.address],
        [synthetixPriceFeed.address],
      );
      const addReceipt = await addTx.wait();
      const derivativesAddedEvents = filterEventsByABI(addReceipt, [DerivativeAddedEventABI]);
      expect(derivativesAddedEvents.length).to.equal(1);
      const derivativeAddedEvent = derivativesAddedEvents[0].args;
      expect(derivativeAddedEvent.derivative).to.equal(mockSynthetixToken2.address);
      expect(derivativeAddedEvent.priceFeed).to.equal(synthetixPriceFeed.address);
    });
    it('Only FundDeployer owner can call', async function () {
      await expect(
        aggregatedDerivativePriceFeed
          .connect(accounts[1])
          .addDerivatives([mockSynthetixToken1.address], [synthetixPriceFeed.address]),
      ).to.revertedWith('onlyFundDeployerOwner');
    });
    it('Derivatives should not be empty', async function () {
      await expect(aggregatedDerivativePriceFeed.addDerivatives([], [synthetixPriceFeed.address])).to.revertedWith(
        'addDerivatives: _derivatives cannot be empty',
      );
    });
    it('PriceFeeds and Derivatives array length should not be unequal', async function () {
      await expect(
        aggregatedDerivativePriceFeed.addDerivatives(
          [mockSynthetixToken1.address, mockSynthetixToken2.address],
          [synthetixPriceFeed.address],
        ),
      ).to.revertedWith('__addDerivatives: Unequal _derivatives and _priceFeeds array lengths');
    });
    it('Should not be able to add if already added', async function () {
      await expect(
        aggregatedDerivativePriceFeed.addDerivatives([mockSynthetixToken1.address], [synthetixPriceFeed.address]),
      ).to.revertedWith('__addDerivatives: Already added');
    });
    it('Should not be able to use zero addresses', async function () {
      await expect(
        aggregatedDerivativePriceFeed.addDerivatives([ethers.constants.AddressZero], [synthetixPriceFeed.address]),
      ).to.revertedWith('__validateDerivativePriceFeed: Empty _derivative');
      await expect(
        aggregatedDerivativePriceFeed.addDerivatives([mockSynthetixToken2.address], [ethers.constants.AddressZero]),
      ).to.revertedWith('__validateDerivativePriceFeed: Empty _priceFeed');
    });
    it('derivative should be an supported sythetix token', async function () {
      await expect(
        aggregatedDerivativePriceFeed.addDerivatives([contracts.mockTokens.MockDai], [synthetixPriceFeed.address]),
      ).to.revertedWith('__validateDerivativePriceFeed: Unsupported derivative');
    });
  });
  describe('State Getters tests', function () {
    it('Should be able to get the priceFeed of derivative', async function () {
      expect(await aggregatedDerivativePriceFeed.getPriceFeedForDerivative(mockSynthetixToken1.address)).to.equal(
        synthetixPriceFeed.address,
      );
      expect(await aggregatedDerivativePriceFeed.getPriceFeedForDerivative(mockSynthetixToken2.address)).to.equal(
        ethers.constants.AddressZero,
      );
    });
    it('Should be able to verify if an asset is a supported asset', async function () {
      expect(await aggregatedDerivativePriceFeed.isSupportedAsset(mockSynthetixToken1.address)).to.be.true;
      expect(await aggregatedDerivativePriceFeed.isSupportedAsset(mockSynthetixToken2.address)).to.be.false;
    });
  });
  describe('updateDerivatives tests', function () {
    let newSynthetixPriceFeed;
    beforeEach(async function () {
      // New PriceFeed to update
      const SynthetixPriceFeed = await hre.ethers.getContractFactory('SynthetixPriceFeed');
      newSynthetixPriceFeed = await SynthetixPriceFeed.deploy(
        contracts.FundDeployer,
        contracts.mockContracts.MockSynthetixIntegratee,
        contracts.mockContracts.MockSynthetixToken,
        [mockSynthetixToken1.address, mockSynthetixToken2.address],
      );
      await newSynthetixPriceFeed.deployed();
    });
    it('Should be able to update price feeds of the derivatives', async function () {
      const updateTx = await aggregatedDerivativePriceFeed.updateDerivatives(
        [mockSynthetixToken1.address],
        [newSynthetixPriceFeed.address],
      );
      const updateReceipt = await updateTx.wait();
      const derivativesUpdatedEvents = filterEventsByABI(updateReceipt, [DerivativeUpdatedEventABI]);
      expect(derivativesUpdatedEvents.length).to.equal(1);
      const derivativeUpdatedEvent = derivativesUpdatedEvents[0].args;
      expect(derivativeUpdatedEvent.derivative).to.equal(mockSynthetixToken1.address);
      expect(derivativeUpdatedEvent.prevPriceFeed).to.equal(synthetixPriceFeed.address);
      expect(derivativeUpdatedEvent.nextPriceFeed).to.equal(newSynthetixPriceFeed.address);
    });
    it('Only FundDeployer owner can call', async function () {
      await expect(
        aggregatedDerivativePriceFeed
          .connect(accounts[1])
          .updateDerivatives([mockSynthetixToken1.address], [synthetixPriceFeed.address]),
      ).to.revertedWith('onlyFundDeployerOwner');
    });
    it('Derivatives should not be empty', async function () {
      await expect(aggregatedDerivativePriceFeed.updateDerivatives([], [synthetixPriceFeed.address])).to.revertedWith(
        'updateDerivatives: _derivatives cannot be empty',
      );
    });
    it('PirceFeeds and Derivatives array length should not be unequal', async function () {
      await expect(
        aggregatedDerivativePriceFeed.updateDerivatives(
          [mockSynthetixToken1.address, mockSynthetixToken2.address],
          [synthetixPriceFeed.address],
        ),
      ).to.revertedWith('updateDerivatives: Unequal _derivatives and _priceFeeds array lengths');
    });
    it('Should not be able to update if not added', async function () {
      await expect(
        aggregatedDerivativePriceFeed.updateDerivatives([mockSynthetixToken2.address], [synthetixPriceFeed.address]),
      ).to.revertedWith('updateDerivatives: Derivative not yet added');
    });
    it('Should not be able to use zero addresses', async function () {
      await expect(
        aggregatedDerivativePriceFeed.updateDerivatives([mockSynthetixToken1.address], [ethers.constants.AddressZero]),
      ).to.revertedWith('__validateDerivativePriceFeed: Empty _priceFeed');
    });
    it('Should not be able to update derivative with the same priceFeed again', async function () {
      await expect(
        aggregatedDerivativePriceFeed.updateDerivatives([mockSynthetixToken1.address], [synthetixPriceFeed.address]),
      ).to.revertedWith('updateDerivatives: Value already set');
    });
  });
  describe('removeDerivatives tests', function () {
    it('Should be able to update price feeds of the derivatives', async function () {
      const removeTx = await aggregatedDerivativePriceFeed.removeDerivatives([mockSynthetixToken1.address]);
      const removeReceipt = await removeTx.wait();
      const derivativesRemovedEvents = filterEventsByABI(removeReceipt, [DerivativeRemovedEventABI]);
      expect(derivativesRemovedEvents.length).to.equal(1);
      const derivativesRemovedEvent = derivativesRemovedEvents[0].args;
      expect(derivativesRemovedEvent.derivative).to.equal(mockSynthetixToken1.address);
    });
    it('Only FundDeployer owner can call', async function () {
      await expect(
        aggregatedDerivativePriceFeed.connect(accounts[1]).removeDerivatives([mockSynthetixToken1.address]),
      ).to.revertedWith('onlyFundDeployerOwner');
    });
    it('Derivatives should not be empty', async function () {
      await expect(aggregatedDerivativePriceFeed.removeDerivatives([])).to.revertedWith(
        'removeDerivatives: _derivatives cannot be empty',
      );
    });
    it('Should not be able to remove if not added', async function () {
      await expect(aggregatedDerivativePriceFeed.removeDerivatives([mockSynthetixToken2.address])).to.revertedWith(
        'removeDerivatives: Derivative not yet added',
      );
    });
  });
  describe('calcUnderlyingValues tests', function () {
    let mockSynthetixPriceSource;
    beforeEach(async function () {
      const MockSynthetixPriceSource = await hre.ethers.getContractFactory('MockSynthetixPriceSource');
      mockSynthetixPriceSource = MockSynthetixPriceSource.attach(contracts.mockContracts.MockSynthetixPriceSource);
      // Setting fixed rate for mockSynthetixToken's currencyKey
      const mockSynthetixToken1CurrencyKey = await mockSynthetixToken1.currencyKey();
      await mockSynthetixPriceSource.setRate(mockSynthetixToken1CurrencyKey, utils.parseEther('1'));
    });
    it('Should be able to calculate underlying values of a derivative', async function () {
      await expect(
        aggregatedDerivativePriceFeed.calcUnderlyingValues(mockSynthetixToken1.address, utils.parseEther('1')),
      ).to.be.not.reverted;
    });
    it('can not use the derivatives which is not added', async function () {
      await expect(
        aggregatedDerivativePriceFeed.calcUnderlyingValues(mockSynthetixToken2.address, utils.parseEther('1')),
      ).to.revertedWith('calcUnderlyingValues: _derivative is not supported');
    });
  });
});
