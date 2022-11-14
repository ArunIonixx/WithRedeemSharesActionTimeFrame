/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { utils } = require('ethers');
const { deployments } = require('./utils/deploy-test-contracts.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contractAddresses;
let accounts;
let deployer;
let valueInterpreter;

beforeEach(async function () {
  // runs before each test in this block

  contractAddresses = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  const ValueInterpreter = await ethers.getContractFactory('ValueInterpreter', deployer);
  valueInterpreter = ValueInterpreter.attach(contractAddresses.ValueInterpreter);
});

describe('Value Interpreter Tests', function () {
  it('Should revert with Arrays unequal lengths', async function () {
    await expect(
      valueInterpreter.calcCanonicalAssetsTotalValue(
        [ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address],
        [],
        ethers.Wallet.createRandom().address,
      ),
    ).to.be.revertedWith('Arrays unequal lengths');
  });

  it('Should revert with Unsupported _quoteAsset', async function () {
    await expect(
      valueInterpreter.calcCanonicalAssetsTotalValue(
        [ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address],
        [ethers.BigNumber.from('1'), ethers.BigNumber.from('1')],
        ethers.Wallet.createRandom().address,
      ),
    ).to.be.revertedWith('Unsupported _quoteAsset');
  });

  it('Should verify  primitive price feed', async function () {
    expect(await valueInterpreter.getPrimitivePriceFeed()).to.equal(contractAddresses.ChainlinkPriceFeed);
  });

  it('Should verify  Aggregated Derivative Price Feed  ', async function () {
    expect(await valueInterpreter.getAggregatedDerivativePriceFeed()).to.equal(
      contractAddresses.AggregatedDerivativePriceFeed,
    );
  });

  it('Should calculate total asset value', async function () {
    const response = await valueInterpreter.calcCanonicalAssetsTotalValue(
      [contractAddresses.mockTokens.MockDai],
      [ethers.BigNumber.from('1')],
      contractAddresses.mockTokens.MockBUSD,
    );
    const tx = await ethers.provider.getTransactionReceipt(response.hash);
    expect(tx.status).to.equal(1);
  });

  it('Should calculate total asset value', async function () {
    let response = await valueInterpreter.calcLiveAssetValue(
      contractAddresses.mockTokens.MockDai,
      ethers.BigNumber.from('1'),
      contractAddresses.mockTokens.MockBUSD,
    );
    let tx = await ethers.provider.getTransactionReceipt(response.hash);
    expect(tx.status).to.equal(1);

    // To calculate for same asset pair
    response = await valueInterpreter.calcLiveAssetValue(
      contractAddresses.mockTokens.MockDai,
      ethers.BigNumber.from('1'),
      contractAddresses.mockTokens.MockDai,
    );
    tx = await ethers.provider.getTransactionReceipt(response.hash);
    expect(tx.status).to.equal(1);
  });

  it('Should be able to calculate live assets total value using calcLiveAssetsTotalValue', async function () {
    const response = await valueInterpreter.calcLiveAssetsTotalValue(
      [contractAddresses.mockTokens.MockDai],
      [ethers.BigNumber.from('1')],
      contractAddresses.mockTokens.MockBUSD,
    );
    const tx = await ethers.provider.getTransactionReceipt(response.hash);
    expect(tx.status).to.equal(1);
  });

  describe('calcCanonicalAssetValue for Derivatives', function () {
    let mockSynthetixToken;
    let mockSynthetixToken1;
    beforeEach(async function () {
      // Creating Synthetix Tokens for test
      const MockSynthetixToken = await hre.ethers.getContractFactory('MockSynthetixToken');
      const sUSD = await MockSynthetixToken.attach(contractAddresses.mockContracts.MockSynthetixToken);
      mockSynthetixToken = await MockSynthetixToken.deploy(
        'Synth Test',
        'sTEST',
        18,
        '0x0000000000000000000000000000000000000000000000000000000000000001',
      );
      await mockSynthetixToken.deployed();
      mockSynthetixToken1 = await MockSynthetixToken.deploy(
        'Synth Test 1',
        'sTEST1',
        18,
        '0x0000000000000000000000000000000000000000000000000000000000000002',
      );
      await mockSynthetixToken1.deployed();

      const SynthetixPriceFeed = await hre.ethers.getContractFactory('SynthetixPriceFeed');
      const synthetixPriceFeed = SynthetixPriceFeed.attach(contractAddresses.SynthetixPriceFeed);

      // Adding synth
      await synthetixPriceFeed.addSynths([mockSynthetixToken.address]);

      const AggregatedDerivativePriceFeed = await ethers.getContractFactory('AggregatedDerivativePriceFeed', deployer);
      const aggregatedDerivativePriceFeed = AggregatedDerivativePriceFeed.attach(
        contractAddresses.AggregatedDerivativePriceFeed,
      );

      // Adding derivatives
      await aggregatedDerivativePriceFeed.addDerivatives(
        [mockSynthetixToken.address, sUSD.address],
        [synthetixPriceFeed.address, synthetixPriceFeed.address],
      );

      const MockSynthetixPriceSource = await hre.ethers.getContractFactory('MockSynthetixPriceSource');
      const mockSynthetixPriceSource = MockSynthetixPriceSource.attach(
        contractAddresses.mockContracts.MockSynthetixPriceSource,
      );
      // Setting fixed rate for synth Tokens
      const mockSynthetixTokenCurrencyKey = await mockSynthetixToken.currencyKey();
      await mockSynthetixPriceSource.setRate(mockSynthetixTokenCurrencyKey, utils.parseEther('1'));
      const sUSDCurrencyKey = await sUSD.currencyKey();
      await mockSynthetixPriceSource.setRate(sUSDCurrencyKey, utils.parseEther('1'));

      const ChainlinkPriceFeed = await ethers.getContractFactory('ChainlinkPriceFeed', deployer);
      const chainlinkPriceFeed = ChainlinkPriceFeed.attach(contractAddresses.ChainlinkPriceFeed);
      await chainlinkPriceFeed.addPrimitives(
        [sUSD.address],
        [contractAddresses.mockContracts.MockChainlinkAggregator],
        [0],
      );
    });

    it('Should be able to calculate asset value of derivative', async function () {
      let tx = await valueInterpreter.calcCanonicalAssetValue(
        mockSynthetixToken.address,
        utils.parseEther('1'),
        contractAddresses.mockTokens.MockDai,
      );
      let receipt = await ethers.provider.getTransactionReceipt(tx.hash);
      expect(receipt.status).to.equal(1);

      // Setting aggregator's lates value to zero to cover the invalid state
      const Aggregator = await ethers.getContractFactory('MockChainlinkAggregator', deployer);
      const aggregator = Aggregator.attach(contractAddresses.mockContracts.MockChainlinkAggregator);
      await aggregator.setLatestAnswer(0);
      tx = await valueInterpreter.calcCanonicalAssetValue(
        mockSynthetixToken.address,
        utils.parseEther('1'),
        contractAddresses.mockTokens.MockDai,
      );
      receipt = await ethers.provider.getTransactionReceipt(tx.hash);
      expect(receipt.status).to.equal(1);
      tx = await valueInterpreter.calcCanonicalAssetsTotalValue(
        [contractAddresses.mockTokens.MockDai],
        [utils.parseEther('1')],
        contractAddresses.mockTokens.MockBUSD,
      );
      receipt = await ethers.provider.getTransactionReceipt(tx.hash);
      expect(receipt.status).to.equal(1);
    });

    it('Should revert if the _baseAsset is not added in derivatives', async function () {
      await expect(
        valueInterpreter.calcCanonicalAssetValue(
          mockSynthetixToken1.address,
          utils.parseEther('1'),
          contractAddresses.mockTokens.MockDai,
        ),
      ).to.revertedWith('__calcAssetValue: Unsupported _baseAsset');
    });

    it('Should revert if the _quoteAsset is not a supported primitve', async function () {
      await expect(
        valueInterpreter.calcCanonicalAssetValue(
          mockSynthetixToken.address,
          utils.parseEther('1'),
          mockSynthetixToken1.address,
        ),
      ).to.revertedWith('calcCanonicalAssetValue: Unsupported _quoteAsset');
    });
  });
});
