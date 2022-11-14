/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers } = require('hardhat');
const { utils } = require('ethers');
const { expect } = require('chai');
const { deployments } = require('./utils/deploy-test-contracts.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contractAddresses;
let accounts;
let deployer;
let comptrollerLib;

beforeEach(async function () {
  // runs before each test in this block

  contractAddresses = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
  comptrollerLib = await ComptrollerLib.attach(contractAddresses.ComptrollerLib);
});

describe('ComptrollerLib  Tests', function () {
  it('Should match Default Denomination Asset  with AddressZero', async function () {
    expect(await comptrollerLib.getDenominationAsset()).to.equal(ethers.constants.AddressZero);
  });

  it('Should match VaultProxy with AddressZero', async function () {
    expect(await comptrollerLib.getVaultProxy()).to.equal(ethers.constants.AddressZero);
  });

  it('Cannot call the buyShares because the vault is not active', async function () {
    await expect(comptrollerLib.buyShares('100', 0, ethers.constants.AddressZero)).to.be.revertedWith(
      'Fund not active',
    );
  });

  it('functions with onlyActive modifier cannot be called if vault is not Active', async function () {
    const abiCoder = new utils.AbiCoder();
    const encodedAssets = abiCoder.encode(['address[]'], [[contractAddresses.mockTokens.MockBUSD]]);
    await expect(
      comptrollerLib.callOnExtension(contractAddresses.IntegrationManager, 1, encodedAssets),
    ).to.be.revertedWith('Fund not active');

    await expect(
      comptrollerLib.vaultCallOnContract(ethers.constants.AddressZero, '0x00000000', '0x00'),
    ).to.be.revertedWith('Fund not active');
    await expect(comptrollerLib.permissionedVaultAction(0, '0x00')).to.be.revertedWith('Fund not active');
  });
});
