/* eslint-disable @typescript-eslint/no-var-requires */
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { extractEventArgs, emptyConfigData, getFundAddresses } = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let accounts;
let deployer;
let dispatcher;
let contracts;

beforeEach(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];

  const Dispatcher = await ethers.getContractFactory('Dispatcher', deployer);
  dispatcher = await Dispatcher.attach(contracts.Dispatcher);
});

describe('Dispatcher Test Suite', function () {
  describe('constructor', () => {
    it('Should match address of dispatcher owner with deployer', async () => {
      const getOwnerCall = await dispatcher.getOwner();
      expect(getOwnerCall).to.equal(deployer.address);
    });

    it('Should match dispatcher nominated owner with address Zero', async () => {
      const getNominatedOwnerCall = await dispatcher.getNominatedOwner();
      expect(getNominatedOwnerCall).to.equal(ethers.constants.AddressZero);
    });
  });

  describe('setNominatedOwner', () => {
    it('can only be called by the contract owner', async () => {
      await expect(
        dispatcher.connect(accounts[1]).setNominatedOwner(ethers.Wallet.createRandom().address),
      ).to.be.revertedWith('Only the contract owner can call this function');
    });

    it('does not allow an empty next owner address', async () => {
      await expect(dispatcher.setNominatedOwner(ethers.constants.AddressZero)).to.be.revertedWith(
        '_nextNominatedOwner cannot be empty',
      );
    });

    it('does not allow the next owner to be the current owner', async () => {
      await expect(dispatcher.setNominatedOwner(await dispatcher.getOwner())).to.be.revertedWith(
        '_nextNominatedOwner is already the owner',
      );
    });

    it('does not allow the next owner to already be nominated', async () => {
      // Nominate the nextOwner a first time
      const nextOwner = ethers.Wallet.createRandom().address;
      await dispatcher.setNominatedOwner(nextOwner);

      // Attempt to nominate the same nextOwner a second time
      await expect(dispatcher.setNominatedOwner(nextOwner)).to.be.revertedWith(
        '_nextNominatedOwner is already nominated',
      );
    });

    it('correctly handles nominating a new owner', async () => {
      // Nominate the nextOwner a first time
      const nextOwnerAddress = ethers.Wallet.createRandom().address;
      const tx = await dispatcher.setNominatedOwner(nextOwnerAddress);

      const receipt = await tx.wait();
      const { nominatedOwner } = extractEventArgs(receipt, 'NominatedOwnerSet');
      expect(nominatedOwner).to.equal(nextOwnerAddress);

      // New owner should have been nominated
      const getNominatedOwnerCall = await dispatcher.getNominatedOwner();
      expect(getNominatedOwnerCall).to.equal(nextOwnerAddress);

      // Ownership should not have changed
      const getOwnerCall = await dispatcher.getOwner();
      expect(getOwnerCall).to.equal(deployer.address);
    });
  });

  describe('removeNominatedOwner', () => {
    it('can only be called by the contract owner', async () => {
      // Set nominated owner
      await dispatcher.setNominatedOwner(ethers.Wallet.createRandom().address);

      // Attempt by a random user to remove nominated owner should fail
      await expect(dispatcher.connect(accounts[1]).removeNominatedOwner()).to.be.revertedWith(
        'Only the contract owner can call this function',
      );
    });
    it('correctly handles removing the nomination', async () => {
      // Set nominated owner
      const nextOwnerAddress = ethers.Wallet.createRandom().address;
      await dispatcher.setNominatedOwner(nextOwnerAddress);

      // Attempt by a random user to remove nominated owner should fail
      const tx = await dispatcher.removeNominatedOwner();
      const receipt = await tx.wait();
      const { nominatedOwner } = extractEventArgs(receipt, 'NominatedOwnerRemoved');
      expect(nominatedOwner).to.equal(nextOwnerAddress);

      // Nomination should have been removed
      const getNominatedOwnerCall = await dispatcher.getNominatedOwner();
      expect(getNominatedOwnerCall).to.equal(ethers.constants.AddressZero);

      // Ownership should not have changed
      const getOwnerCall = await dispatcher.getOwner();
      expect(getOwnerCall).to.equal(deployer.address);
    });
    it('can only be called when there is a nominated owner', async function () {
      await expect(dispatcher.removeNominatedOwner()).to.be.revertedWith(
        'removeNominatedOwner: There is no nominated owner',
      );
    });
  });

  describe('claimOwnership', () => {
    it('can only be called by the nominatedOwner', async () => {
      // Set nominated owner
      await dispatcher.setNominatedOwner(ethers.Wallet.createRandom().address);

      // Attempt by a random user to claim ownership should fail
      await expect(dispatcher.connect(accounts[1]).claimOwnership()).to.be.revertedWith(
        'Only the nominatedOwner can call this function',
      );
    });

    it('correctly handles transferring ownership', async () => {
      const oldOwner = await dispatcher.getOwner();
      // Set nominated owner
      const nominatedOwner = accounts[1];
      await dispatcher.setNominatedOwner(nominatedOwner.address);

      // Claim ownership
      const tx = await dispatcher.connect(nominatedOwner).claimOwnership();
      const receipt = await tx.wait();
      const { prevOwner, nextOwner } = extractEventArgs(receipt, 'OwnershipTransferred');
      expect(prevOwner).to.equal(oldOwner);
      expect(nextOwner).to.equal(nominatedOwner.address);

      // Owner should now be the nominatedOwner
      const getOwnerCall = await dispatcher.getOwner();
      expect(getOwnerCall).to.equal(nominatedOwner.address);

      // nominatedOwner should be empty
      const getNominatedOwnerCall = await dispatcher.getNominatedOwner();
      expect(getNominatedOwnerCall).to.equal(ethers.constants.AddressZero);
    });
  });

  describe('setSharesTokenSymbol', () => {
    it('disallows a call by a random user', async () => {
      const randomAccount = accounts[1];

      // Attempt to setSharesTokenSymbol with random account
      const setSharesTokenSymbolCall = dispatcher.connect(randomAccount).setSharesTokenSymbol('TEST');
      await expect(setSharesTokenSymbolCall).to.be.revertedWith('Only the contract owner can call this function');
    });

    it('correctly updates the SharesTokenSymbol', async () => {
      // Call setSharesTokenSymbol
      const tx = await dispatcher.setSharesTokenSymbol('TEST');
      const receipt = await tx.wait();
      const { _nextSymbol } = extractEventArgs(receipt, 'SharesTokenSymbolSet');
      expect(_nextSymbol).to.equal('TEST');

      const getSharesTokenSymbolCall = await dispatcher.getSharesTokenSymbol();
      expect(getSharesTokenSymbolCall).to.equal('TEST');
    });
  });

  describe('setCurrentFundDeployer', () => {
    it('disallows calling with account other than owner', async () => {
      // Attempt to set a fund deployer with a non-owner account
      const setCurrentFundDeployerCall = dispatcher.connect(accounts[1]).setCurrentFundDeployer(deployer.address);
      expect(setCurrentFundDeployerCall).to.be.revertedWith('Only the contract owner can call this function');
    });

    it('disallows empty address as nextFundDeployer', async () => {
      // Attempt to set a fund deployer with a non-owner account
      const setCurrentFundDeployerCall = dispatcher.setCurrentFundDeployer(ethers.constants.AddressZero);
      expect(setCurrentFundDeployerCall).to.be.revertedWith('_nextFundDeployer cannot be empty');
    });

    it('does not allow _nextFundDeployer to be a non-contract', async () => {
      await expect(dispatcher.setCurrentFundDeployer(ethers.Wallet.createRandom().address)).to.be.revertedWith(
        'Non-contract _nextFundDeployer',
      );
    });

    it('does not allow _nextFundDeployer to be currentFundDeployer', async () => {
      const currentFundDeployer = await dispatcher.getCurrentFundDeployer();
      await expect(dispatcher.setCurrentFundDeployer(currentFundDeployer)).to.be.revertedWith(
        'setCurrentFundDeployer: _nextFundDeployer is already currentFundDeployer',
      );
    });

    it('correctly handles valid fund deployer address update', async () => {
      const previousFundDeployer = await dispatcher.getCurrentFundDeployer();

      const FundDeployer = await hre.ethers.getContractFactory('FundDeployer', deployer);
      const newFundDeployer = await FundDeployer.deploy(contracts.Dispatcher, contracts.FNDZController, [], []);
      await newFundDeployer.deployed();

      const tx = await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
      const receipt = await tx.wait();
      const { prevFundDeployer, nextFundDeployer } = extractEventArgs(receipt, 'CurrentFundDeployerSet');
      expect(prevFundDeployer).to.equal(previousFundDeployer);
      expect(nextFundDeployer).to.equal(newFundDeployer.address);
      const updatedFundDeployer = await dispatcher.getCurrentFundDeployer();
      expect(updatedFundDeployer).to.equal(newFundDeployer.address);
    });
  });

  describe('getFundDeployerForVaultProxy', () => {
    it('returns FundDeployer of a vaultProxy', async function () {
      const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
      const fndzController = FNDZController.attach(contracts.FNDZController);

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
      const { vaultProxy } = getFundAddresses(receipt);

      expect(await dispatcher.getFundDeployerForVaultProxy(vaultProxy)).to.equal(contracts.FundDeployer);
    });
  });

  describe('getMigrationTimelock', () => {
    it('returns the migrationTimeLock value', async function () {
      await dispatcher.setMigrationTimelock(10);
      expect(await dispatcher.getMigrationTimelock()).to.equal(10);
    });
  });

  describe('setMigrationTimelock', () => {
    it('Should be able to set the migrationTimelock', async function () {
      await expect(dispatcher.setMigrationTimelock(10)).to.be.not.reverted;
      expect(await dispatcher.getMigrationTimelock()).to.equal(10);
    });

    it('Should not able to set the same migration time lock again', async function () {
      await dispatcher.setMigrationTimelock(10);
      await expect(dispatcher.setMigrationTimelock(10)).to.revertedWith(
        'setMigrationTimelock: _nextTimelock is the current timelock',
      );
    });
  });
});
