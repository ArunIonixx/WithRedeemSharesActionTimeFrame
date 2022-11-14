/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { utils } = require('ethers');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { emptyConfigData, filterEventsByABI } = require('./utils/fndz-utilities.js');

let accounts;
let deployer;
let FundDeployer;
let fundDeployer;
let contracts;

beforeEach(async function () {
  // runs before each test in this block
  contracts = await deployments();
  //console.log('contracts', contracts);
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  FundDeployer = await ethers.getContractFactory('FundDeployer', deployer);
  fundDeployer = await FundDeployer.attach(contracts.FundDeployer);
});

describe('Fund Deployer', function () {
  it("Should return the new instance of FundDeployer once it's deployed", async function () {
    expect(fundDeployer).to.be.an('object');
  });

  it('Should have  the release status to prelaunch', async function () {
    expect(await fundDeployer.getReleaseStatus()).to.equal(1);
  });

  it('Should verify for the valid VaultLib address ', async function () {
    expect(await fundDeployer.getVaultLib()).to.equal(contracts.VaultLib);
  });

  it('Does not allow createNewFund to be called directly', async () => {
    await expect(
      fundDeployer.createNewFund(
        deployer.address,
        'Test Fund',
        contracts.mockContracts.WETH,
        '1',
        emptyConfigData,
        emptyConfigData,
      ),
    ).to.be.revertedWith('Only the FNDZ Controller can call this function');
  });

  it('Should be able to read state variables', async function () {
    expect(await fundDeployer.getComptrollerLib()).to.equal(contracts.ComptrollerLib);
    expect(await fundDeployer.getCreator()).to.equal(deployer.address);
    expect(await fundDeployer.getDispatcher()).to.equal(contracts.Dispatcher);
  });

  describe('Vault Call Registering Tests', function () {
    let mockVaultCall;
    let selectors;
    const vaultCallRegisteredEventABI = 'event VaultCallRegistered(address indexed contractAddress, bytes4 selector)';
    const vaultCallDeregisteredEventABI =
      'event VaultCallDeregistered(address indexed contractAddress, bytes4 selector)';
    beforeEach(async function () {
      const MockVaultCall = await ethers.getContractFactory('MockVaultCall', deployer);
      mockVaultCall = await MockVaultCall.deploy();
      await mockVaultCall.deployed();

      const receiveValueMethodABI = 'function receiveValue(uint256 _value)';
      const invalidMethodABI = 'function invalidMethod(uint256 _value)';
      selectors = new utils.Interface([receiveValueMethodABI, invalidMethodABI]);
    });
    describe('Registering Vault Calls Tests', function () {
      it('Should be able to register vault calls', async function () {
        const selector = selectors.getSighash('receiveValue');
        const registerTx = await fundDeployer.registerVaultCalls([mockVaultCall.address], [selector]);
        const registerReceipt = await registerTx.wait();
        const vaultCallRegisteredEvents = filterEventsByABI(registerReceipt, [vaultCallRegisteredEventABI]);
        expect(vaultCallRegisteredEvents.length).to.equal(1);
        const vaultCallRegisteredEvent = vaultCallRegisteredEvents[0].args;
        expect(vaultCallRegisteredEvent.contractAddress).to.equal(mockVaultCall.address);
        expect(vaultCallRegisteredEvent.selector).to.equal(selector);
      });
      it('Should be able to verify registered vault calls', async function () {
        await fundDeployer.registerVaultCalls([mockVaultCall.address], [selectors.getSighash('receiveValue')]);
        expect(await fundDeployer.isRegisteredVaultCall(mockVaultCall.address, selectors.getSighash('receiveValue'))).to
          .be.true;
        expect(await fundDeployer.isRegisteredVaultCall(mockVaultCall.address, selectors.getSighash('invalidMethod')))
          .to.be.false;
      });
      it('contracts list can not be empty', async function () {
        await expect(fundDeployer.registerVaultCalls([], [])).to.revertedWith('registerVaultCalls: Empty _contracts');
      });
      it('contracts and selectors length should be same', async function () {
        await expect(
          fundDeployer.registerVaultCalls(
            [mockVaultCall.address],
            [selectors.getSighash('receiveValue'), selectors.getSighash('invalidMethod')],
          ),
        ).to.revertedWith('__registerVaultCalls: Uneven input arrays');
      });
      it('Should not be able to register a same call again', async function () {
        await fundDeployer.registerVaultCalls([mockVaultCall.address], [selectors.getSighash('receiveValue')]);
        await expect(
          fundDeployer.registerVaultCalls([mockVaultCall.address], [selectors.getSighash('receiveValue')]),
        ).to.revertedWith('__registerVaultCalls: Call already registered');
      });
      it('Only owner can call', async function () {
        await expect(
          fundDeployer
            .connect(accounts[1])
            .registerVaultCalls([mockVaultCall.address], [selectors.getSighash('receiveValue')]),
        ).to.revertedWith('Only the contract owner can call this function');
      });
    });
    describe('Deregistering Vault Calls Tests', function () {
      it('Should be able to deregister vault calls', async function () {
        const selector = selectors.getSighash('receiveValue');
        // Registring a vault call
        await fundDeployer.registerVaultCalls([mockVaultCall.address], [selector]);

        const registerTx = await fundDeployer.deregisterVaultCalls([mockVaultCall.address], [selector]);
        const registerReceipt = await registerTx.wait();
        const vaultCallDeregisteredEvents = filterEventsByABI(registerReceipt, [vaultCallDeregisteredEventABI]);
        expect(vaultCallDeregisteredEvents.length).to.equal(1);
        const vaultCallDeregisteredEvent = vaultCallDeregisteredEvents[0].args;
        expect(vaultCallDeregisteredEvent.contractAddress).to.equal(mockVaultCall.address);
        expect(vaultCallDeregisteredEvent.selector).to.equal(selector);
      });
      it('contracts list can not be empty', async function () {
        await expect(fundDeployer.deregisterVaultCalls([], [])).to.revertedWith(
          'deregisterVaultCalls: Empty _contracts',
        );
      });
      it('contracts and selectors length should be same', async function () {
        await expect(
          fundDeployer.deregisterVaultCalls(
            [mockVaultCall.address],
            [selectors.getSighash('receiveValue'), selectors.getSighash('invalidMethod')],
          ),
        ).to.revertedWith('deregisterVaultCalls: Uneven input arrays');
      });
      it('Should not be able to deregister a call which is not registered', async function () {
        await expect(
          fundDeployer.deregisterVaultCalls([mockVaultCall.address], [selectors.getSighash('receiveValue')]),
        ).to.revertedWith('deregisterVaultCalls: Call not registered');
      });
      it('Only owner can call', async function () {
        await expect(
          fundDeployer
            .connect(accounts[1])
            .deregisterVaultCalls([mockVaultCall.address], [selectors.getSighash('receiveValue')]),
        ).to.revertedWith('Only the contract owner can call this function');
      });
    });
  });
});
