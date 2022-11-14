/* eslint-disable @typescript-eslint/no-var-requires */
const { Interface } = require('@ethersproject/abi');
const { expect } = require('chai');
const { BigNumber, utils } = require('ethers');
const { ethers } = require('hardhat');
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
let fndzController;
let mockAugustusSwapper;
let integrationManager;
let deployer;
let comptrollerProxy;
let vaultProxy;
let comptroller;
let usdcToken;
let takeOrderInterface;
let samplePathV5;
let abiCoder;
let busdToken;
let daiToken;
let chainlinkPriceFeed;

const partnerFee = 20;

beforeEach(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  abiCoder = new utils.AbiCoder();

  takeOrderInterface = new Interface([takeOrderABI]);

  samplePathV5 = [
    [
      contracts.mockTokens.MockUSDC,
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

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contracts.FNDZController);
  expect(fndzController).to.be.an('object');

  const IntegrationManager = await ethers.getContractFactory('IntegrationManager', deployer);
  integrationManager = IntegrationManager.attach(contracts.IntegrationManager);
  expect(integrationManager).to.be.an('object');

  const ChainlinkPriceFeed = await ethers.getContractFactory('ChainlinkPriceFeed', deployer);
  chainlinkPriceFeed = ChainlinkPriceFeed.attach(contracts.ChainlinkPriceFeed);

  const MockParaSwapV5AugustusSwapper = await ethers.getContractFactory('MockParaSwapV5AugustusSwapper', deployer);
  mockAugustusSwapper = MockParaSwapV5AugustusSwapper.attach(contracts.MockParaSwapV5AugustusSwapper);

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

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  busdToken = MockToken.attach(contracts.mockTokens.MockBUSD);
  usdcToken = MockToken.attach(contracts.mockTokens.MockUSDC);
  daiToken = MockToken.attach(contracts.mockTokens.MockDai);

  // Adding Balance to Vault
  await busdToken.approve(comptroller.address, utils.parseEther('10'));
  await comptroller.buyShares(utils.parseEther('10'), 0, ethers.constants.AddressZero);
});

describe('Paraswap Trade', function () {
  it('Should Make Trade', async function () {
    const incomingAmount = utils.parseEther('2');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      utils.parseEther('1'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    const response = await comptroller.callOnExtension(
      integrationManager.address,
      BigNumber.from('0'),
      encodedTradeData,
    );
    const tradeTx = await ethers.provider.getTransactionReceipt(response.hash);
    expect(tradeTx.status).to.equal(1);
    expect(await usdcToken.balanceOf(vaultProxy)).to.equals(incomingAmount);
  });

  it('Should Make Trade and Deduct Partner Fee If partnerAddress and partnerFee present', async function () {
    const incomingAmount = utils.parseEther('2');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      utils.parseEther('1'),
      uuidParse(uuidv4()),
      await fndzController.fndzDao(),
      partnerFee,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    const response = await comptroller.callOnExtension(
      integrationManager.address,
      BigNumber.from('0'),
      encodedTradeData,
    );
    const tradeTx = await ethers.provider.getTransactionReceipt(response.hash);
    expect(tradeTx.status).to.equal(1);
    const feeAmount = incomingAmount.mul(await fndzController.getParaSwapFee()).div(10000);
    expect(await usdcToken.balanceOf(vaultProxy)).to.equals(incomingAmount.sub(feeAmount));
    expect(await usdcToken.balanceOf(await fndzController.fndzDao())).to.equal(
      feeAmount.mul(utils.parseEther('0.85')).div(utils.parseEther('1')),
    );
  });

  it('Authorized users only allowed to create trade', async function () {
    const incomingAmount = utils.parseEther('2');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      utils.parseEther('1'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    await expect(
      comptroller
        .connect(accounts[1])
        .callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData),
    ).to.be.revertedWith('receiveCallFromComptroller: Not an authorized user');
  });

  it('Adaptor Should be Registered', async function () {
    const incomingAmount = utils.parseEther('2');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      utils.parseEther('1'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [ethers.constants.AddressZero, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    await expect(
      comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData),
    ).to.be.revertedWith('callOnIntegration: Adapter is not registered');
  });

  it('Incoming asset address of Encode Data Should be Valid', async function () {
    samplePathV5[0][0] = ethers.constants.AddressZero;
    const incomingAmount = utils.parseEther('2');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      utils.parseEther('1'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    await expect(
      comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData),
    ).to.be.revertedWith('__preProcessCoI: Empty incoming asset address');
  });

  it('Minimum Incoming asset of Encode Data Should be greater than zero', async function () {
    const minIncomingAmount = BigNumber.from('0');
    const expectedIncomingAmount = BigNumber.from('10000000000000000000');
    const outgoingAmount = BigNumber.from('10000000000000000000');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      minIncomingAmount,
      expectedIncomingAmount,
      busdToken.address,
      outgoingAmount,
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await expect(
      comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData),
    ).to.be.revertedWith('__preProcessCoI: minIncomingAssetAmount must be >0');
  });

  it('Insufficient Balance to Trade', async function () {
    const incomingAmount = utils.parseEther('15');
    const outgoingAmount = utils.parseEther('15');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      outgoingAmount,
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    await expect(
      comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData),
    ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
  });

  it('Incoming asset should be present in prmitive or derivative assets list', async function () {
    // Removing prmitive from Price Feed for test
    await chainlinkPriceFeed.removePrimitives([contracts.mockTokens.MockDai]);
    samplePathV5[0][0] = contracts.mockTokens.MockDai;
    const incomingAmount = BigNumber.from('10000000000000000000');
    const outgoingAmount = BigNumber.from('10000000000000000000');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      outgoingAmount,
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    await expect(
      comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData),
    ).to.be.revertedWith('__preProcessCoI: Non-receivable incoming asset');
  });

  it('outgoing asset should not be invalid', async function () {
    const incomingAmount = BigNumber.from('10000000000000000000');
    const outgoingAmount = BigNumber.from('10000000000000000000');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      ethers.constants.AddressZero,
      outgoingAmount,
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    await expect(
      comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData),
    ).to.be.revertedWith('__preProcessCoI: Empty spend asset');
  });

  it('outgoing asset amount should be greater than zero', async function () {
    const incomingAmount = BigNumber.from('10000000000000000000');
    const outgoingAmount = BigNumber.from('0');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      outgoingAmount,
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    await expect(
      comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData),
    ).to.be.revertedWith('__preProcessCoI: Empty max spend asset amount');
  });

  it('Trade does not allow invalid _extension', async function () {
    const incomingAmount = utils.parseEther('2');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      utils.parseEther('1'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await expect(
      comptroller.callOnExtension(ethers.constants.AddressZero, BigNumber.from('0'), encodedTradeData),
    ).to.be.revertedWith('callOnExtension: _extension invalid');
  });

  it('Trade does not allow invalid _actionId', async function () {
    const incomingAmount = utils.parseEther('2');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      utils.parseEther('1'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );
    await expect(
      comptroller.callOnExtension(integrationManager.address, BigNumber.from('5'), encodedTradeData),
    ).to.be.revertedWith('receiveCallFromComptroller: Invalid _actionId');
  });

  it('Revert if _callArgs is not valid', async function () {
    const invalidEncodedData = abiCoder.encode(['address'], [ethers.constants.AddressZero]);
    await expect(comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), invalidEncodedData)).to.be
      .reverted;
  });

  it('Revert if received amount less than expected', async function () {
    // Add Some cost to deduct in Mocked Augustus Swapper Contract
    await mockAugustusSwapper.setCost(1);

    const incomingAmount = utils.parseEther('2');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      busdToken.address,
      utils.parseEther('1'),
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    await expect(
      comptroller.callOnExtension(integrationManager.address, BigNumber.from('0'), encodedTradeData),
    ).to.be.revertedWith('__reconcileCoIAssets: Received incoming asset less than expected');
  });

  it('Should be able to trade from air-dropped unapproved asset to approved asset', async function () {
    // Removing prmitive from Price Feed for test
    await chainlinkPriceFeed.removePrimitives([usdcToken.address]);
    // Air-dropping a usdc tokens
    await usdcToken.mintFor(vaultProxy, utils.parseEther('1'));
    samplePathV5[0][0] = daiToken.address;
    const incomingAmount = utils.parseEther('1');
    const outgoingAmount = utils.parseEther('1');
    const encodedParaswapCallArgs = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
      incomingAmount,
      incomingAmount,
      usdcToken.address,
      outgoingAmount,
      uuidParse(uuidv4()),
      ethers.constants.AddressZero,
      0,
      samplePathV5,
    ]);
    const encodedTradeData = abiCoder.encode(
      ['address', 'bytes4', 'bytes'],
      [contracts.ParaSwapV5Adapter, takeOrderInterface.getSighash('takeOrder'), encodedParaswapCallArgs],
    );

    await comptroller.callOnExtension(integrationManager.address, 0, encodedTradeData);
    expect(await usdcToken.balanceOf(vaultProxy)).to.equal(0);
    expect(await daiToken.balanceOf(vaultProxy)).to.equal(incomingAmount);
  });
});
