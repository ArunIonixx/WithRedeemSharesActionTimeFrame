/* eslint-disable @typescript-eslint/no-var-requires */
const { Interface } = require('@ethersproject/abi');
const { ethers } = require('hardhat');
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { deployments } = require('./utils/deploy-test-contracts.js');
const {
  emptyConfigData,
  getFundAddresses,
  takeOrderABI,
  paraSwapV5CallArgsEncodeType,
} = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let chainlinkPriceFeed;
let mockChainlinkAggregator;
let fndzController;
let comptrollerProxy;
let vaultProxy;
let comptroller;
let mockBUSD;
let mockDai;

beforeEach(async function () {
  // runs before each test in this block
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contracts.FNDZController);

  /// Creating a Vault
  const tx = await fndzController.createNewFund(
    deployer.address,
    'Test Vault',
    contracts.mockTokens.MockBUSD,
    '1',
    emptyConfigData,
    emptyConfigData,
  );
  const receipt = await tx.wait();
  ({ comptrollerProxy, vaultProxy } = getFundAddresses(receipt));

  const Comptroller = await ethers.getContractFactory('ComptrollerLib', deployer);
  comptroller = Comptroller.attach(comptrollerProxy);
  expect(comptroller).to.be.an('object');

  //Deploying a Another Aggregator for Testing purpose
  const MockChainlinkAggregator = await hre.ethers.getContractFactory('MockChainlinkAggregator');
  mockChainlinkAggregator = await MockChainlinkAggregator.deploy([0]);
  await mockChainlinkAggregator.deployed();
  const ChainlinkPriceFeed = await ethers.getContractFactory('ChainlinkPriceFeed', deployer);
  chainlinkPriceFeed = ChainlinkPriceFeed.attach(contracts.ChainlinkPriceFeed);
  await chainlinkPriceFeed.removePrimitives([contracts.mockTokens.MockDai, contracts.mockTokens.MockUSDC]);
});

describe('ChainlinkPriceFeed Test Cases', function () {
  it('should be able to set and get a Stale Rate Threshold and verify the event', async () => {
    //setting a Stale Rate Threshold
    const tx = await chainlinkPriceFeed.setStaleRateThreshold(12);
    const receipt = await tx.wait();

    // Verifying the emitted event
    expect(receipt.events[0].event).to.equal('StaleRateThresholdSet');

    //verify with the above set value
    const threshold = await chainlinkPriceFeed.getStaleRateThreshold();
    expect(threshold).to.equal(12);
  });

  it('Should not be able to set stale rate threshold twice', async () => {
    await chainlinkPriceFeed.setStaleRateThreshold(12);
    await expect(chainlinkPriceFeed.setStaleRateThreshold(12)).to.be.revertedWith(
      '__setStaleRateThreshold: Value already set',
    );
  });

  it('does not allow the empty primitives to add with the given aggregator and rateAsset values', async () => {
    await expect(
      chainlinkPriceFeed.addPrimitives([], [contracts.mockContracts.MockChainlinkAggregator], [0]),
    ).to.be.revertedWith('addPrimitives: _primitives cannot be empty');
  });

  it('does not allow the primitives and aggregators array length which are unequal', async () => {
    await expect(
      chainlinkPriceFeed.addPrimitives(
        [contracts.mockTokens.MockDai, contracts.mockTokens.MockUSDC],
        [contracts.mockContracts.MockChainlinkAggregator],
        [0],
      ),
    ).to.be.revertedWith('__addPrimitives: Unequal _primitives and _aggregators array lengths');
  });

  it('does not allow the primitives and rateAsset array length which are unequal', async () => {
    await expect(
      chainlinkPriceFeed.addPrimitives(
        [contracts.mockTokens.MockDai, contracts.mockTokens.MockUSDC],
        [contracts.mockContracts.MockChainlinkAggregator, contracts.mockContracts.MockChainlinkAggregator],
        [0],
      ),
    ).to.be.revertedWith('__addPrimitives: Unequal _primitives and _rateAssets array lengths');
  });

  it('does not allow the aggregtor to be zero account', async () => {
    await expect(
      chainlinkPriceFeed.addPrimitives(
        [contracts.mockTokens.MockDai, contracts.mockTokens.MockUSDC],
        [ethers.constants.AddressZero, ethers.constants.AddressZero],
        [0, 0],
      ),
    ).to.be.revertedWith('__validateAggregator: Empty _aggregator');
  });

  it('Should adds a list of primitives with the given aggregator and rateAsset values and emits the add event', async () => {
    const tx = await chainlinkPriceFeed.addPrimitives(
      [contracts.mockTokens.MockDai],
      [contracts.mockContracts.MockChainlinkAggregator],
      [0],
    );
    let receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    expect(receipt.status).to.equal(1);

    // Verifying the udpate event
    receipt = await tx.wait();
    expect(receipt.events[0].event).to.equal('PrimitiveAdded');
  });

  it('Should get a list of primitives with the given aggregator and rateAsset values', async function () {
    //adding a set of primitives
    const tx = await chainlinkPriceFeed.addPrimitives(
      [contracts.mockTokens.MockDai],
      [contracts.mockContracts.MockChainlinkAggregator],
      [0],
    );
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    expect(receipt.status).to.equal(1);

    //checking with the above added primitives
    const aggregatorInfo = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(contracts.mockTokens.MockDai);
    expect(aggregatorInfo.aggregator).to.equal(contracts.mockContracts.MockChainlinkAggregator);
    expect(aggregatorInfo.rateAsset).to.equal(0);
  });

  it('does not allow the primitives and aggregators array length which are unequal while updating', async () => {
    await expect(
      chainlinkPriceFeed.updatePrimitives(
        [contracts.mockTokens.MockDai, contracts.mockTokens.MockUSDC],
        [contracts.mockContracts.MockChainlinkAggregator],
      ),
    ).to.be.revertedWith('updatePrimitives: Unequal _primitives and _aggregators array lengths');
  });

  it('does not allow the empty primitives to update with the given aggregator', async () => {
    await expect(
      chainlinkPriceFeed.updatePrimitives([], [contracts.mockContracts.MockChainlinkAggregator]),
    ).to.be.revertedWith('updatePrimitives: _primitives cannot be empty');
  });

  it("Should not be able to update primitive's aggregator which is not yet added", async () => {
    await expect(
      chainlinkPriceFeed.updatePrimitives([contracts.mockTokens.MockDai], [ethers.constants.AddressZero]),
    ).to.be.revertedWith('updatePrimitives: Primitive not yet added');
  });

  it('does not allow the same aggregtor to be added again while updating', async () => {
    //Adding a set of primitives with aggregator
    const tx = await chainlinkPriceFeed.addPrimitives(
      [contracts.mockTokens.MockDai],
      [contracts.mockContracts.MockChainlinkAggregator],
      [0],
    );
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    expect(receipt.status).to.equal(1);

    //Updating the added primitives
    await expect(
      chainlinkPriceFeed.updatePrimitives(
        [contracts.mockTokens.MockDai],
        [contracts.mockContracts.MockChainlinkAggregator],
      ),
    ).to.be.revertedWith('updatePrimitives: Value already set');
  });

  it('Should update a primitives with the given aggregator and verify the update event', async () => {
    //Adding a set of primitive with aggregators
    const tx = await chainlinkPriceFeed.addPrimitives(
      [contracts.mockTokens.MockDai],
      [contracts.mockContracts.MockChainlinkAggregator],
      [0],
    );
    let receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    expect(receipt.status).to.equal(1);

    //Updating the primitive with the deployed aggregator
    const txn = await chainlinkPriceFeed.updatePrimitives(
      [contracts.mockTokens.MockDai],
      [mockChainlinkAggregator.address],
    );
    receipt = await ethers.provider.getTransactionReceipt(txn.hash);
    expect(receipt.status).to.equal(1);

    // Verifying the Update event
    receipt = await txn.wait();
    expect(receipt.events[0].event).to.equal('PrimitiveUpdated');

    //Checking with the above updated aggregator
    const aggregatorInfo = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(contracts.mockTokens.MockDai);
    expect(aggregatorInfo.aggregator).to.equals(mockChainlinkAggregator.address);
    expect(aggregatorInfo.rateAsset).to.equals(0);
  });

  it('Should be able to remove a primitive and verify the emit event', async () => {
    //Adding a set of primitive with aggregators
    await chainlinkPriceFeed.addPrimitives(
      [contracts.mockTokens.MockDai],
      [contracts.mockContracts.MockChainlinkAggregator],
      [0],
    );

    //Removing primitive with aggregators
    const tx = await chainlinkPriceFeed.removePrimitives([contracts.mockTokens.MockDai]);
    let receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    expect(receipt.status).to.equal(1);

    // Verifying the emitting event
    receipt = await tx.wait();
    expect(receipt.events[0].event).to.equal('PrimitiveRemoved');
  });

  it('_primitives args should not be empty while removing', async () => {
    await expect(chainlinkPriceFeed.removePrimitives([])).to.be.revertedWith(
      'removePrimitives: _primitives cannot be empty',
    );
  });

  it('Should not be able to remove the primitive which is not added yet', async () => {
    await expect(chainlinkPriceFeed.removePrimitives([contracts.mockTokens.MockDai])).to.be.revertedWith(
      'removePrimitives: Primitive not yet added',
    );
  });

  it('Only FNDZController owner can add/remove/update primitives', async () => {
    // Adding
    await expect(
      chainlinkPriceFeed
        .connect(accounts[1])
        .addPrimitives([contracts.mockTokens.MockDai], [contracts.mockContracts.MockChainlinkAggregator], [0]),
    ).to.be.revertedWith('onlyFNDZControllerOwner: Only the FNDZController owner can call this function');

    // Updating
    await expect(
      chainlinkPriceFeed
        .connect(accounts[1])
        .updatePrimitives([contracts.mockTokens.MockDai], [mockChainlinkAggregator.address]),
    ).to.be.revertedWith('onlyFNDZControllerOwner: Only the FNDZController owner can call this function');

    // Removing
    await expect(
      chainlinkPriceFeed.connect(accounts[1]).removePrimitives([contracts.mockTokens.MockDai]),
    ).to.be.revertedWith('onlyFNDZControllerOwner: Only the FNDZController owner can call this function');
  });

  it('Should be traded only if the token is added as a primitive by a vault', async function () {
    const abiCoder = new utils.AbiCoder();
    const takeOrderInterface = new Interface([takeOrderABI]);
    const IntegrationManager = await ethers.getContractFactory('IntegrationManager', deployer);
    const integrationManager = IntegrationManager.attach(contracts.IntegrationManager);
    expect(integrationManager).to.be.an('object');

    const MockToken = await ethers.getContractFactory('MockToken', deployer);
    mockBUSD = MockToken.attach(contracts.mockTokens.MockBUSD);
    expect(mockBUSD).to.be.an('object');

    mockDai = MockToken.attach(contracts.mockTokens.MockDai);
    expect(mockDai).to.be.an('object');

    const denominationAsset = mockBUSD;
    const tradedAsset = mockDai;

    const samplePath = [
      [
        tradedAsset.address,
        '0',
        [
          [
            '0x0000000000000000000000000000000000000000',
            100,
            0,
            [
              [
                0,
                '0x0000000000000000000000000000000000000000',
                10000,
                '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
                0,
              ],
            ],
          ],
        ],
      ],
    ];

    //Adding Balance to the vault
    await mockBUSD.approve(comptrollerProxy, utils.parseEther('1000'));
    const depositAmount = utils.parseEther('100');
    const buyShareResult = await comptroller.buyShares(depositAmount, 0, ethers.constants.AddressZero);
    await buyShareResult.wait();

    //checking with the above added primitives
    let aggregatorInfo = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(contracts.mockTokens.MockBUSD);
    expect(aggregatorInfo.aggregator).to.equal(contracts.mockContracts.MockChainlinkAggregator);
    expect(aggregatorInfo.rateAsset).to.equal(0);
    let tx = await chainlinkPriceFeed.isSupportedAsset(contracts.mockTokens.MockBUSD);
    expect(tx).to.equal(true);
    tx = await chainlinkPriceFeed.isSupportedAsset(contracts.mockTokens.MockDai);
    expect(tx).to.equal(false);

    //Trying to trade token BUSD to DAI
    const incomingAmount = utils.parseEther('20');
    const outgoingAmount = utils.parseEther('10');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      denominationAsset.address,
      outgoingAmount,
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePath,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await expect(
      comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData),
    ).to.be.revertedWith('__preProcessCoI: Non-receivable incoming asset');

    //adding a set of primitives
    tx = await chainlinkPriceFeed.addPrimitives(
      [contracts.mockTokens.MockDai],
      [contracts.mockContracts.MockChainlinkAggregator],
      [0],
    );
    //checking with the above added primitives
    aggregatorInfo = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(contracts.mockTokens.MockDai);
    expect(aggregatorInfo.aggregator).to.equal(contracts.mockContracts.MockChainlinkAggregator);
    expect(aggregatorInfo.rateAsset).to.equal(0);

    tx = await chainlinkPriceFeed.isSupportedAsset(contracts.mockTokens.MockDai);
    expect(tx).to.equal(true);

    const response = await comptroller.callOnExtension(
      integrationManager.address,
      BigNumber.from('0'),
      encodedTradeData,
    );
    const tradeTx = await ethers.provider.getTransactionReceipt(response.hash);
    expect(tradeTx.status).to.equal(1);
    expect(await tradedAsset.balanceOf(vaultProxy)).to.equals(incomingAmount);
  });

  it('Should get the ethUsdAggregator, WETH Token, rateAsset , unit variable value', async () => {
    //setting a EthUsd Aggregator
    let txn = await chainlinkPriceFeed.setEthUsdAggregator(mockChainlinkAggregator.address);
    let receipt = await txn.wait();
    expect(receipt.status).to.equal(1);

    //verify with the above set value
    const ethUsdAggregator = await chainlinkPriceFeed.getEthUsdAggregator();
    expect(ethUsdAggregator).to.equal(mockChainlinkAggregator.address);

    //verify with the above set WETH Token
    const wethToken = await chainlinkPriceFeed.getWethToken();
    expect(wethToken).to.equal(contracts.mockContracts.WETH);

    //Added a primitive
    txn = await chainlinkPriceFeed.addPrimitives(
      [contracts.mockTokens.MockDai],
      [contracts.mockContracts.MockChainlinkAggregator],
      [0],
    );
    receipt = await ethers.provider.getTransactionReceipt(txn.hash);
    expect(receipt.status).to.equal(1);

    //Get the rateAsset value for the primitive
    let rateAssetvalue = await chainlinkPriceFeed.getRateAssetForPrimitive(contracts.mockTokens.MockDai);
    expect(rateAssetvalue).to.equal(0);
    rateAssetvalue = await chainlinkPriceFeed.getRateAssetForPrimitive(contracts.mockContracts.WETH);
    expect(rateAssetvalue).to.equal(0);

    //Get the unit variable value for the primitive
    const value = BigNumber.from('1000000000000000000');
    let unitValue = await chainlinkPriceFeed.getUnitForPrimitive(contracts.mockTokens.MockDai);
    expect(unitValue).to.equal(value);
    unitValue = await chainlinkPriceFeed.getUnitForPrimitive(contracts.mockContracts.WETH);
    expect(unitValue).to.equal(value);
  });

  it('Should return the correct FNDZController address', async function () {
    expect(await chainlinkPriceFeed.getFNDZController()).to.equal(contracts.FNDZController);
  });
});
