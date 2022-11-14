/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { deployments } = require('./utils/deploy-test-contracts.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contractAddresses;
let accounts;
let deployer;
let vaultLib;

beforeEach(async function () {
  // runs before each test in this block

  contractAddresses = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
  vaultLib = await VaultLib.attach(contractAddresses.VaultLib);
});

describe('VaultLib Tests', function () {
  it('Should match accessorValue with AddressZero', async function () {
    expect(await vaultLib.getAccessor()).to.equal(ethers.constants.AddressZero);
  });

  it('Should match Creator Value with AddressZero', async function () {
    expect(await vaultLib.getCreator()).to.equal(ethers.constants.AddressZero);
  });

  it('Should match Migrator Value with AddressZero', async function () {
    expect(await vaultLib.getMigrator()).to.equal(ethers.constants.AddressZero);
  });

  it('Should match ownerValue with AddressZero', async function () {
    expect(await vaultLib.getOwner()).to.equal(ethers.constants.AddressZero);
  });

  it('Should match trackedAssetValue with AddressZero', async function () {
    // console.log("Testing",await vaultLib.getTrackedAssets());
    expect(await vaultLib.getTrackedAssets()).to.deep.equal([]);
  });

  it('Vaultlib name should be empty', async function () {
    expect(await vaultLib.name()).to.equal('');
  });

  it('Should match Decimal Value To 18', async function () {
    expect(await vaultLib.decimals()).to.equal(18);
  });
});
