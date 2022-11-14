/* eslint-disable @typescript-eslint/no-var-requires */
const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { filterEventsByABI } = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let accessor;

let chainlinkPriceAggregator;
let priceAggregatorProxy;

// Event ABIs
const priceFeedUpdatedABI = 'event PriceFeedUpdated(address[] tokens, int256[] prices, uint256 requestedAt)';
const oracleUpdatedABI = 'event OracleUpdated(address _old, address _new)';

beforeEach(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];

  accessor = accounts[5];
  const ChainlinkPriceAggregator = await ethers.getContractFactory('ChainlinkPriceAggregator', deployer);
  chainlinkPriceAggregator = await upgrades.deployProxy(ChainlinkPriceAggregator, [accessor.address]);
  await chainlinkPriceAggregator.deployed();

  const PriceAggregatorProxy = await ethers.getContractFactory('PriceAggregatorProxy', deployer);
  priceAggregatorProxy = await PriceAggregatorProxy.deploy(
    chainlinkPriceAggregator.address,
    contracts.mockTokens.MockDai,
    'DAI / USD',
    8,
  );
  await priceAggregatorProxy.deployed();
});

describe('ChainLinkPriceAggregator Test Suite', function () {
  it('Oracle can update the Price of the tokens', async function () {
    const timestamp = Math.floor(new Date().getTime() / 1000);
    const updateTx = await chainlinkPriceAggregator
      .connect(accessor)
      .updatePriceFeed([contracts.mockTokens.MockDai], [BigNumber.from('100000000')], timestamp);
    const updateReceipt = await updateTx.wait();
    const updateEvents = filterEventsByABI(updateReceipt, [priceFeedUpdatedABI]);
    expect(updateEvents.length).to.equal(1);
    expect(updateEvents[0].args.tokens).to.eql([contracts.mockTokens.MockDai]);
    expect(updateEvents[0].args.prices[0]).to.eq(BigNumber.from('100000000'));
    expect(updateEvents[0].args.requestedAt).to.equal(timestamp);
  });
  it('Only accessor can update price feeds', async function () {
    const timestamp = Math.floor(new Date().getTime() / 1000);
    await expect(
      chainlinkPriceAggregator.updatePriceFeed(
        [contracts.mockTokens.MockDai],
        [BigNumber.from('100000000')],
        timestamp,
      ),
    ).to.revertedWith('Only accessor');
  });
  it('timestamp should only be the present one', async function () {
    const present_timestamp = Math.floor(new Date().getTime() / 1000);
    await chainlinkPriceAggregator
      .connect(accessor)
      .updatePriceFeed([contracts.mockTokens.MockDai], [BigNumber.from('100000000')], present_timestamp);

    const future_timestamp = (await ethers.provider.getBlock('latest')).timestamp * 2;
    await expect(
      chainlinkPriceAggregator
        .connect(accessor)
        .updatePriceFeed([contracts.mockTokens.MockDai], [BigNumber.from('100000000')], future_timestamp),
    ).to.revertedWith('Invalid timestamp');
    const past_timestamp = present_timestamp - 1;
    await expect(
      chainlinkPriceAggregator
        .connect(accessor)
        .updatePriceFeed([contracts.mockTokens.MockDai], [BigNumber.from('100000000')], past_timestamp),
    ).to.revertedWith('Invalid timestamp');
    await expect(
      chainlinkPriceAggregator
        .connect(accessor)
        .updatePriceFeed([contracts.mockTokens.MockDai], [BigNumber.from('100000000')], 0),
    ).to.revertedWith('Invalid timestamp');
  });
  it('_tokens cant have the zero address', async function () {
    const timestamp = Math.floor(new Date().getTime() / 1000);
    await expect(
      chainlinkPriceAggregator
        .connect(accessor)
        .updatePriceFeed([ethers.constants.AddressZero], [BigNumber.from('100000000')], timestamp),
    ).to.revertedWith('_tokens contain the zero address');
  });
  it('_prices should be greater than zero', async function () {
    const timestamp = Math.floor(new Date().getTime() / 1000);
    await expect(
      chainlinkPriceAggregator.connect(accessor).updatePriceFeed([contracts.mockTokens.MockDai], [0], timestamp),
    ).to.revertedWith('_prices should be greater than 0');
  });
  it('Should be able to update the oracle', async function () {
    const updateTx = await chainlinkPriceAggregator.updateOracle(accounts[6].address);
    const updateReceipt = await updateTx.wait();
    const events = filterEventsByABI(updateReceipt, [oracleUpdatedABI]);
    expect(events.length).to.equal(1);
    expect(events[0].args._old).to.equal(accessor.address);
    expect(events[0].args._new).to.equal(accounts[6].address);
  });
  it('only owner can update the oracle', async function () {
    await expect(chainlinkPriceAggregator.connect(accounts[1]).updateOracle(accounts[6].address)).to.revertedWith(
      'Ownable: caller is not the owner',
    );
  });
  it('Should be able to fetch the price and timestamp', async function () {
    const timestamp = Math.floor(new Date().getTime() / 1000);
    await chainlinkPriceAggregator
      .connect(accessor)
      .updatePriceFeed([contracts.mockTokens.MockDai], [BigNumber.from('100000000')], timestamp);
    expect(await chainlinkPriceAggregator.getPrice(contracts.mockTokens.MockDai)).to.equal(BigNumber.from('100000000'));
    expect(await chainlinkPriceAggregator.latestTimestamp()).to.equal(timestamp);
  });
});

describe('PriceAggregatorProxy Test Suite', async function () {
  let timestamp;
  beforeEach(async function () {
    timestamp = Math.floor(new Date().getTime() / 1000);
    await chainlinkPriceAggregator
      .connect(accessor)
      .updatePriceFeed([contracts.mockTokens.MockDai], [BigNumber.from('100000000')], timestamp);
  });

  it('Should be able read price and latest timestamp from aggregator', async function () {
    expect(await priceAggregatorProxy.latestAnswer()).to.equal(BigNumber.from('100000000'));
    expect(await priceAggregatorProxy.latestTimestamp()).to.equal(timestamp);
    expect(await priceAggregatorProxy.aggregator()).to.equal(chainlinkPriceAggregator.address);
    expect(await priceAggregatorProxy.token()).to.equal(contracts.mockTokens.MockDai);
    expect(await priceAggregatorProxy.description()).to.equal('DAI / USD');
    expect(await priceAggregatorProxy.decimals()).to.equal(8);
  });
});
