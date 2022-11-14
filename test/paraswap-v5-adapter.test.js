/* eslint-disable @typescript-eslint/no-var-requires */
const { Interface } = require('@ethersproject/abi');
const { expect } = require('chai');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { BigNumber, utils } = require('ethers');
const { ethers } = require('hardhat');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { takeOrderABI, paraSwapV5CallArgsEncodeType } = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let abiCoder;
let samplePath;
let encodedData;
let takeOrderInterface;
let paraSwapV5Adapter;

before(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  abiCoder = new utils.AbiCoder();

  takeOrderInterface = new Interface([takeOrderABI, 'function invalidTakeOrder(address)']);
  samplePath = [
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
  encodedData = abiCoder.encode(paraSwapV5CallArgsEncodeType, [
    BigNumber.from('2000'),
    BigNumber.from('2000'),
    contracts.mockTokens.MockDai,
    BigNumber.from('1000'),
    uuidParse(uuidv4()),
    ethers.constants.AddressZero,
    0,
    samplePath,
  ]);

  const ParaSwapV5Adapter = await ethers.getContractFactory('ParaSwapV5Adapter', deployer);
  paraSwapV5Adapter = ParaSwapV5Adapter.attach(contracts.ParaSwapV5Adapter);
  expect(paraSwapV5Adapter).to.be.an('object');
});

describe('ParaSwapV5Adapter Test Cases', function () {
  it('Get the Identifier', async function () {
    expect(await paraSwapV5Adapter.identifier()).to.be.equals('PARA_SWAP_V5');
  });

  it('Should parse the encoded data correctly', async function () {
    const response = await paraSwapV5Adapter.parseAssetsForMethod(
      takeOrderInterface.getSighash('takeOrder'),
      encodedData,
    );
    expect(response.spendAssetsHandleType_).to.be.equals(2);
    expect(response.spendAssets_[0]).to.be.equal(contracts.mockTokens.MockDai);
    expect(response.spendAssetAmounts_[0]).equals(BigNumber.from('1000'));
    expect(response.incomingAssets_[0]).to.be.equals(contracts.mockTokens.MockUSDC);
    expect(response.minIncomingAssetAmounts_[0]).equals(BigNumber.from('2000'));
  });

  it('Should not accept invalid selector signature', async function () {
    await expect(
      paraSwapV5Adapter.parseAssetsForMethod(takeOrderInterface.getSighash('invalidTakeOrder'), encodedData),
    ).to.be.revertedWith('parseAssetsForMethod: _selector invalid');
  });

  it('Revert if encoded data is not valid', async function () {
    const invalidEncodedData = abiCoder.encode(['address'], [ethers.constants.AddressZero]);
    await expect(
      paraSwapV5Adapter.parseAssetsForMethod(takeOrderInterface.getSighash('invalidTakeOrder'), invalidEncodedData),
    ).to.be.reverted;
  });

  it('Only Integration Manger can call the takeOrder method', async function () {
    await expect(paraSwapV5Adapter.takeOrder(ethers.constants.AddressZero, encodedData, '0x')).to.be.revertedWith(
      'Only the IntegrationManager can call this function',
    );
  });

  it('Get AugustusSwapper Address', async function () {
    expect(await paraSwapV5Adapter.getParaSwapV5AugustusSwapper()).to.be.equals(
      contracts.MockParaSwapV5AugustusSwapper,
    );
  });

  it('Get TokenTransferProxy Address', async function () {
    expect(await paraSwapV5Adapter.getParaSwapV5TokenTransferProxy()).to.be.equals(accounts[5].address);
  });
});
