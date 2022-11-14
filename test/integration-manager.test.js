/* eslint-disable @typescript-eslint/no-var-requires */
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { emptyConfigData, getFundAddresses, filterEventsByABI } = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let comptrollerProxy;
let fndzController;
let integrationManager;

before(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contracts.FNDZController);
  expect(fndzController).to.be.an('object');

  const IntegrationManager = await ethers.getContractFactory('IntegrationManager', deployer);
  integrationManager = IntegrationManager.attach(contracts.IntegrationManager);
  expect(integrationManager).to.be.an('object');

  
  
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
  expect(receipt.status).to.equal(1);

  ({ comptrollerProxy,vaultProxy } = getFundAddresses(receipt));
  const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
  comptrollerLib = ComptrollerLib.attach(comptrollerProxy);
  expect(comptrollerLib).to.be.an('object');

  const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
  vaultLib = VaultLib.attach(vaultProxy);
  expect(comptrollerLib).to.be.an('object');


});

describe('Integration Manager Test Cases', function () {
  it('able to add authenticated user for a fund', async function () {
    await integrationManager.addAuthUserForFund(comptrollerProxy, accounts[1].address);
    expect(await integrationManager.isAuthUserForFund(comptrollerProxy, accounts[1].address)).to.be.true;
  });

  it('able to remove authenticated user of a fund', async function () {
    await integrationManager.removeAuthUserForFund(comptrollerProxy, accounts[1].address);
    expect(await integrationManager.isAuthUserForFund(comptrollerProxy, accounts[1].address)).to.be.false;
  });

  it('isAuthUserForFund should return false for unauthenticated users', async function () {
    expect(await integrationManager.isAuthUserForFund(comptrollerProxy, accounts[2].address)).to.be.false;
  });

  it('Fund Owner should be an Authenticated user', async function () {
    expect(await integrationManager.isAuthUserForFund(comptrollerProxy, deployer.address)).to.be.true;
  });

  it('Should not be able to add/remove fund owner', async function () {
    await expect(integrationManager.addAuthUserForFund(comptrollerProxy, deployer.address)).to.be.revertedWith(
      '__validateSetAuthUser: Cannot set for the fund owner',
    );
    await expect(integrationManager.removeAuthUserForFund(comptrollerProxy, deployer.address)).to.be.revertedWith(
      '__validateSetAuthUser: Cannot set for the fund owner',
    );
  });

  it('Only the fund owner can add/remove Authenticated user', async function () {
    await expect(
      integrationManager.connect(accounts[1]).addAuthUserForFund(comptrollerProxy, deployer.address),
    ).to.be.revertedWith('__validateSetAuthUser: Only the fund owner can call this function');
    await expect(
      integrationManager.connect(accounts[1]).removeAuthUserForFund(comptrollerProxy, deployer.address),
    ).to.be.revertedWith('__validateSetAuthUser: Only the fund owner can call this function');
  });

  it("Only activated fund's comptroller proxy can be used", async function () {
    await expect(
      integrationManager.addAuthUserForFund(ethers.constants.AddressZero, accounts[1].address),
    ).to.be.revertedWith('__validateSetAuthUser: Fund has not been activated');
    await expect(
      integrationManager.removeAuthUserForFund(ethers.constants.AddressZero, accounts[1].address),
    ).to.be.revertedWith('__validateSetAuthUser: Fund has not been activated');
  });

  it('An account can be added only once', async function () {
    await integrationManager.addAuthUserForFund(comptrollerProxy, accounts[1].address);
    await expect(integrationManager.addAuthUserForFund(comptrollerProxy, accounts[1].address)).to.be.revertedWith(
      '__validateSetAuthUser: Account is already an authorized user',
    );
  });

  it('Should not be able to remove unauthenticated user', async function () {
    await expect(integrationManager.removeAuthUserForFund(comptrollerProxy, accounts[2].address)).to.be.revertedWith(
      '__validateSetAuthUser: Account is not an authorized user',
    );
  });

  it('Should emit the events', async function () {
    let response = await integrationManager.addAuthUserForFund(comptrollerProxy, accounts[2].address);
    let receipt = await response.wait();
    expect(receipt.events[0].event).to.be.equals('AuthUserAddedForFund');
    response = await integrationManager.removeAuthUserForFund(comptrollerProxy, accounts[2].address);
    receipt = await response.wait();
    expect(receipt.events[0].event).to.be.equals('AuthUserRemovedForFund');
  });
});
describe('Shorting Trade Test Cases', function () {
  it('FNDZShortingBot should be an Authenticated user', async function () {
    await fndzController.updateFNDZShortingBotAddress(deployer.address);
    const fndzShortingBot = await fndzController.getFNDZShortingBotAddress();
    expect(fndzShortingBot).to.be.equal(deployer.address);
    expect(await integrationManager.isAuthUserForFund(comptrollerProxy, deployer.address)).to.be.true;
  });
  it('FNDZShortingBot should be able call callOnExtention', async function () {
    //FNDZShortingBotAddress is assigned as accounts[1].address
    await fndzController.updateFNDZShortingBotAddress(accounts[1].address);  
     
    const MockToken = await ethers.getContractFactory('MockToken', deployer);
    mockUSDC = MockToken.attach(contracts.mockTokens.MockUSDC);
    expect(mockUSDC).to.be.an('object');
   
    const args = [contracts.mockTokens.MockUSDC];
    var encodedAddresses = ethers.utils.defaultAbiCoder.encode(['address[]'], [args]);
    var trackedAssetResultTx = await comptrollerLib.connect(accounts[1]).callOnExtension(
      integrationManager.address,
      ethers.BigNumber.from('1'),
      encodedAddresses,
    );
    
    const receipt = await trackedAssetResultTx.wait();
    expect(receipt.status).to.equal(1);
    
    const trackedAssetEvent = filterEventsByABI(receipt, ['event TrackedAssetAdded(address asset)']);
    expect(trackedAssetEvent.length).to.equal(1);
    expect(contracts.mockTokens.MockUSDC).to.equal(trackedAssetEvent[0].args.asset);

    expect(await vaultLib.isTrackedAsset(contracts.mockTokens.MockUSDC)).to.be.true;
  });
  
  });
