/* eslint-disable @typescript-eslint/no-var-requires */
const { utils, BigNumber } = require('ethers');
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployments } = require('./utils/deploy-test-contracts.js');
const {
  emptyConfigData,
  getFundAddresses,
  filterEventsByABI,
  advanceTime,
  comptrollerProxyDeployedEventABI,
} = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let contracts;
let accounts;
let deployer;
let investor1;
let investor2;
let denominationAsset;
let comptrollerProxy;
let vaultProxy;
let newComptrollerProxy;
let feeConfigData;
let policyConfigData;

let fndzController;
let dispatcher;
let fundDeployer;
let newFundDeployer;
let comptroller;
let vault;
let mockBUSD;
let mockUSDC;

const migrationTimeLock = 24 * 60 * 60;
const migrationSignaledEventABI =
  'event MigrationSignaled(address indexed vaultProxy,address indexed prevFundDeployer,address indexed nextFundDeployer,address nextVaultAccessor,address nextVaultLib,uint256 executableTimestamp)';
const migrationExecutedEventABI =
  'event MigrationExecuted(address indexed vaultProxy,address indexed prevFundDeployer,address indexed nextFundDeployer,address nextVaultAccessor,address nextVaultLib,uint256 executableTimestamp)';
const migrationCancelledEventABI =
  'event MigrationCancelled(address indexed vaultProxy,address indexed prevFundDeployer,address indexed nextFundDeployer,address nextVaultAccessor,address nextVaultLib,uint256 executableTimestamp)';
const migratorSetEventABI = 'event MigratorSet(address prevMigrator, address nextMigrator)';

beforeEach(async function () {
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  investor1 = accounts[1];
  investor2 = accounts[2];
  const abiCoder = new utils.AbiCoder();

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contracts.FNDZController);
  expect(fndzController).to.be.an('object');

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  mockBUSD = MockToken.attach(contracts.mockTokens.MockBUSD);
  expect(mockBUSD).to.be.an('object');
  denominationAsset = mockBUSD;

  const encodedFeeData = abiCoder.encode(['uint256'], [utils.parseEther('0.01')]);
  feeConfigData = abiCoder.encode(['address[]', 'bytes[]'], [[contracts.EntranceReferralFee], [encodedFeeData]]);
  const encodedPolicyData = abiCoder.encode(['address[]', 'address[]'], [[investor1.address, investor2.address], []]);
  policyConfigData = abiCoder.encode(['address[]', 'bytes[]'], [[contracts.InvestorWhitelist], [encodedPolicyData]]);

  const newFundTx = await fndzController.createNewFund(
    deployer.address,
    'Migration Vault',
    mockBUSD.address,
    '1',
    feeConfigData,
    policyConfigData,
  );
  const newFundReceipt = await newFundTx.wait();
  ({ comptrollerProxy, vaultProxy } = getFundAddresses(newFundReceipt));

  const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
  comptroller = ComptrollerLib.attach(comptrollerProxy);
  expect(comptroller).to.be.an('object');

  const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
  vault = VaultLib.attach(vaultProxy);
  expect(vault).to.be.an('object');

  const Dispatcher = await ethers.getContractFactory('Dispatcher', deployer.address);
  dispatcher = Dispatcher.attach(contracts.Dispatcher);
  // Set MigrationTimeLock
  await dispatcher.setMigrationTimelock(migrationTimeLock);

  const FundDeployer = await hre.ethers.getContractFactory('FundDeployer', deployer);
  fundDeployer = await FundDeployer.attach(contracts.FundDeployer);

  newFundDeployer = await FundDeployer.deploy(dispatcher.address, fndzController.address, [], []);
  await newFundDeployer.deployed();

  const newComptrollerLib = await ComptrollerLib.deploy(
    dispatcher.address,
    newFundDeployer.address,
    contracts.ValueInterpreter,
    contracts.FeeManager,
    contracts.IntegrationManager,
    contracts.PolicyManager,
    contracts.ChainlinkPriceFeed,
  );

  await newFundDeployer.setComptrollerLib(newComptrollerLib.address);
  await newFundDeployer.setReleaseStatus(1); // set new fund deployer release status to live

  await denominationAsset.mintFor(investor1.address, utils.parseEther('1000'));
  await denominationAsset.mintFor(investor2.address, utils.parseEther('1000'));
  // Buying some shares initially
  const depositAmount = utils.parseEther('100');
  await denominationAsset.connect(investor1).approve(comptroller.address, depositAmount);
  await comptroller.connect(investor1).buyShares(depositAmount, 0, ethers.constants.AddressZero);
  await denominationAsset.connect(investor2).approve(comptroller.address, depositAmount);
  await comptroller.connect(investor2).buyShares(depositAmount, 0, ethers.constants.AddressZero);

  mockUSDC = MockToken.attach(contracts.mockTokens.MockUSDC);
  expect(mockUSDC).to.be.an('object');
  // Adding mockUSDC to the tracked Assets
  const encodedTrackedAssetCallArgs = abiCoder.encode(['address[]'], [[mockUSDC.address]]);
  await comptroller.callOnExtension(contracts.IntegrationManager, 1, encodedTrackedAssetCallArgs);
  expect((await vault.getTrackedAssets()).length).to.equal(2);
  // AirDroping some mockUSDC token to vault
  await mockUSDC.transfer(vault.address, BigNumber.from('10000000'));
});

describe('Vault Migration Test Suite', function () {
  it('Should be able to migrate vault on new release', async function () {
    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    const investor1SharesBeforeMigration = await vault.balanceOf(investor1.address);
    const investor2SharesBeforeMigration = await vault.balanceOf(investor2.address);
    const trackedAssetBeforeMigration = await vault.getTrackedAssets();
    const usdcBalanceBeforeMigration = await mockUSDC.balanceOf(vault.address);
    const busdBalanceBeforeMigration = await mockBUSD.balanceOf(vault.address);

    // Initiating the Migration Config for a vault
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      feeConfigData,
      policyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    expect(comptrollerDeployedEvent.creator).to.equal(deployer.address);
    expect(comptrollerDeployedEvent.denominationAsset).to.equal(denominationAsset.address);
    expect(comptrollerDeployedEvent.sharesActionTimelock).to.equal(BigNumber.from('1'));
    expect(comptrollerDeployedEvent.feeManagerConfigData).to.equal(feeConfigData);
    expect(comptrollerDeployedEvent.policyManagerConfigData).to.equal(policyConfigData);
    expect(comptrollerDeployedEvent.forMigration).to.be.true;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    // Signal the Migration to start
    const signalTx = await newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy);
    const signalReceipt = await signalTx.wait();
    const migrationSignaledEvents = filterEventsByABI(signalReceipt, [migrationSignaledEventABI]);
    expect(migrationSignaledEvents.length).to.equal(1);
    const migrationSignaledEvent = migrationSignaledEvents[0].args;
    expect(migrationSignaledEvent.vaultProxy).to.equal(vaultProxy);
    expect(migrationSignaledEvent.prevFundDeployer).to.equal(fundDeployer.address);
    expect(migrationSignaledEvent.nextFundDeployer).to.equal(newFundDeployer.address);
    expect(migrationSignaledEvent.nextVaultAccessor).to.equal(newComptrollerProxy);
    expect(migrationSignaledEvent.nextVaultLib).to.equal(contracts.VaultLib);

    // Verify, if the execution called before migrationTimeLock ends, throw error
    await expect(newFundDeployer.executeMigration(vaultProxy)).to.be.revertedWith(
      'executeMigration: The migration timelock has not elapsed',
    );

    // Advancing the time to complete the migrationTimeLock
    const migrationTimeLock = 24 * 60 * 60;
    await advanceTime(migrationTimeLock);

    const executeTx = await newFundDeployer.executeMigration(vaultProxy);
    const executeReceipt = await executeTx.wait();
    const migrationExecutedEvents = filterEventsByABI(executeReceipt, [migrationExecutedEventABI]);
    expect(migrationExecutedEvents.length).to.equal(1);
    const migrationExecutedEvent = migrationSignaledEvents[0].args;
    expect(migrationExecutedEvent.vaultProxy).to.equal(vaultProxy);
    expect(migrationExecutedEvent.prevFundDeployer).to.equal(fundDeployer.address);
    expect(migrationExecutedEvent.nextFundDeployer).to.equal(newFundDeployer.address);
    expect(migrationExecutedEvent.nextVaultAccessor).to.equal(newComptrollerProxy);
    expect(migrationExecutedEvent.nextVaultLib).to.equal(contracts.VaultLib);

    // Creating comptroller instance of newly deployed comptrollerProxy
    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    const newComptroller = ComptrollerLib.attach(newComptrollerProxy);

    // Verify the vault shares
    expect(await vault.balanceOf(investor1.address)).to.equal(investor1SharesBeforeMigration);
    expect(await vault.balanceOf(investor2.address)).to.equal(investor2SharesBeforeMigration);

    // Verify the vault assets
    expect(await vault.getTrackedAssets()).to.deep.equal(trackedAssetBeforeMigration);
    expect(await mockBUSD.balanceOf(vault.address)).to.equal(busdBalanceBeforeMigration);
    expect(await mockUSDC.balanceOf(vault.address)).to.equal(usdcBalanceBeforeMigration);

    // Verify whether the investors able to redeem the available shares after migration
    await expect(newComptroller.connect(investor1).redeemSharesDetailed(0, [], [])).to.be.not.reverted;
    await expect(newComptroller.connect(investor2).redeemSharesDetailed(0, [], [])).to.be.not.reverted;

    // Verify able to buyShares after migration
    const depositAmount = utils.parseEther('100');
    await denominationAsset.connect(investor1).approve(newComptroller.address, depositAmount);
    await expect(newComptroller.connect(investor1).buyShares(depositAmount, 0, ethers.constants.AddressZero)).to.be.not
      .reverted;
    await denominationAsset.connect(investor2).approve(newComptroller.address, depositAmount);
    await expect(newComptroller.connect(investor2).buyShares(depositAmount, 0, ethers.constants.AddressZero)).to.be.not
      .reverted;

    // Verify whether the old comptroller is self destructed
    expect(await ethers.provider.getCode(comptroller.address)).to.be.equal('0x');
  });

  it('Should be able to create Migrated fund config only in live release', async function () {
    await newFundDeployer.setReleaseStatus(2); // Setting the release status to Paused
    await expect(
      newFundDeployer.createMigratedFundConfig(denominationAsset.address, '1', emptyConfigData, emptyConfigData),
    ).to.revertedWith('Release is not Live');
  });

  it('Should be able to signal the migration only in live release', async function () {
    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    // Initiate the migration
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    await newFundDeployer.setReleaseStatus(2); // Setting the release status to Paused
    await expect(newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy)).to.be.revertedWith(
      'Release is not Live',
    );
  });

  it('Only the new comptroller proxy creator can signal the migration', async function () {
    // Initiating the Migration Config for a vault using the vault manager account
    let migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    let migrateReceipt = await migrateTx.wait();
    let comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    let comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    // non migrator cannot signal the migration that was created by the vault owner
    await expect(
      newFundDeployer.connect(accounts[1]).signalMigration(vaultProxy, newComptrollerProxy),
    ).to.be.revertedWith('Only the ComptrollerProxy creator can call this function');

    // check the pending migration creator
    expect(await newFundDeployer.getPendingComptrollerProxyCreator(newComptrollerProxy)).to.equal(deployer.address);

    // Initiating the Migration Config for a vault
    migrateTx = await newFundDeployer
      .connect(accounts[1])
      .createMigratedFundConfig(denominationAsset.address, '1', emptyConfigData, emptyConfigData);
    migrateReceipt = await migrateTx.wait();
    comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    // vault owner cannot signal the migration that was created by another account
    await expect(newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy)).to.be.revertedWith(
      'Only the ComptrollerProxy creator can call this function',
    );

    // check the pending migration creator
    expect(await newFundDeployer.getPendingComptrollerProxyCreator(newComptrollerProxy)).to.equal(accounts[1].address);
  });

  it('The migrator cannot execute a rogue migration, and can ignore the rogue migration', async function () {
    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    // Initiating the Migration Config for a vault by a rogue account
    const rogueMigrateTx = await newFundDeployer
      .connect(accounts[1])
      .createMigratedFundConfig(denominationAsset.address, '1', emptyConfigData, emptyConfigData);
    const rogueMigrateReceipt = await rogueMigrateTx.wait();
    const rogueComptrollerDeployedEvents = filterEventsByABI(rogueMigrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(rogueComptrollerDeployedEvents.length).to.equal(1);
    const rogueComptrollerDeployedEvent = rogueComptrollerDeployedEvents[0].args;
    newComptrollerProxy = rogueComptrollerDeployedEvent.comptrollerProxy;

    // check the pending migration creator
    expect(await newFundDeployer.getPendingComptrollerProxyCreator(newComptrollerProxy)).to.equal(accounts[1].address);

    // Vault owner cannot execute a rogue migration
    await expect(newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy)).to.be.revertedWith(
      'Only the ComptrollerProxy creator can call this function',
    );

    // Initiate a migration config by the rightful vault owner
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    await expect(newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy)).to.be.not.reverted;
  });

  it('The migrator cannot replace the comptroller address with an arbitrary smart contract when they signal a migration', async function () {
    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    // Initiate a migration config by the rightful vault owner
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    const randomOtherSmartContract = contracts.mockTokens.MockBUSD;

    // Cannot signal the migration because the randomOtherSmartContract was not registered
    // in the new fund deployer during the migration process
    await expect(newFundDeployer.signalMigration(vaultProxy, randomOtherSmartContract)).to.be.revertedWith(
      'Only the ComptrollerProxy creator can call this function',
    );
  });

  it('Only current fund deployer can signal the migration', async function () {
    // Initiating the Migration Config for a vault
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    // It reverts because the new FundDeployer is not the current fund deployer of the Dispatcher
    await expect(newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy)).to.be.revertedWith(
      'Only the current FundDeployer can call this function',
    );
  });

  it('Only the permissioned migrator can signal the migration', async function () {
    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    // Initiating the Migration Config for a vault
    const migrateTx = await newFundDeployer
      .connect(accounts[1])
      .createMigratedFundConfig(denominationAsset.address, '1', emptyConfigData, emptyConfigData);
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    // It reverts because only the owner and the migrator can signal the migration
    // accounts[1] is not a migrator
    await expect(
      newFundDeployer.connect(accounts[1]).signalMigration(vaultProxy, newComptrollerProxy),
    ).to.be.revertedWith('Only a permissioned migrator can call this function');

    // Setting accounts[1] as migrator of the vault
    await vault.setMigrator(accounts[1].address);

    // Migrator initiating the signal migration
    await expect(newFundDeployer.connect(accounts[1]).signalMigration(vaultProxy, newComptrollerProxy)).to.be.not
      .reverted;
  });

  it('signal migration is possible only on new fund deployer', async function () {
    // Initiating the Migration Config for a vault
    const migrateTx = await fundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    await expect(fundDeployer.signalMigration(vaultProxy, newComptrollerProxy)).to.be.revertedWith(
      'signalMigration: Can only migrate to a new FundDeployer',
    );
  });

  it('Should not allow to execute migration without signaling', async function () {
    await expect(newFundDeployer.executeMigration(vaultProxy)).to.be.revertedWith(
      'executeMigration: No migration request exists for _vaultProxy',
    );
  });

  it('Only the newFund deployer can execute the migration', async function () {
    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    // Initiating the Migration Config for a vault
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    // Signal the Migration to start
    const signalTx = await newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy);
    const signalReceipt = await signalTx.wait();
    const migrationSignaledEvents = filterEventsByABI(signalReceipt, [migrationSignaledEventABI]);
    expect(migrationSignaledEvents.length).to.equal(1);

    await expect(fundDeployer.executeMigration(vaultProxy)).to.be.revertedWith(
      'executeMigration: Only the target FundDeployer can call this function',
    );
  });

  it('Only the permissioned migrator can execute the migration', async function () {
    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    // Initiating the Migration Config for a vault
    const migrateTx = await newFundDeployer
      .connect(accounts[1])
      .createMigratedFundConfig(denominationAsset.address, '1', emptyConfigData, emptyConfigData);
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    const migrator = accounts[1];
    // Setting accounts[1] as migrator of the vault
    await vault.setMigrator(migrator.address);

    // Signal the Migration to start
    const signalTx = await newFundDeployer.connect(migrator).signalMigration(vaultProxy, newComptrollerProxy);
    const signalReceipt = await signalTx.wait();
    const migrationSignaledEvents = filterEventsByABI(signalReceipt, [migrationSignaledEventABI]);
    expect(migrationSignaledEvents.length).to.equal(1);

    // Advancing the time to complete the migrationTimeLock
    const migrationTimeLock = 24 * 60 * 60;
    await advanceTime(migrationTimeLock);

    // It reverts because only the owner and accounts[1] can execute the migration
    await expect(newFundDeployer.connect(accounts[2]).executeMigration(vaultProxy)).to.be.revertedWith(
      'Only a permissioned migrator can call this function',
    );

    // Migrator initiating the execution
    await expect(newFundDeployer.connect(migrator).executeMigration(vaultProxy)).to.be.not.reverted;
  });

  it('Only the current fund deployer can execute the pending migration', async function () {
    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    // Initiating the Migration Config for a vault
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    // Signal the Migration to start
    const signalTx = await newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy);
    const signalReceipt = await signalTx.wait();
    const migrationSignaledEvents = filterEventsByABI(signalReceipt, [migrationSignaledEventABI]);
    expect(migrationSignaledEvents.length).to.equal(1);

    // Changing the current fund Deployer to the older one
    await dispatcher.setCurrentFundDeployer(fundDeployer.address);

    await expect(newFundDeployer.executeMigration(vaultProxy)).to.be.revertedWith(
      'executeMigration: The target FundDeployer is no longer the current FundDeployer',
    );
  });

  it('Should be able to cancel the migration request', async function () {
    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    // Initiating the Migration Config for a vault
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    // Signal the Migration to start
    const signalTx = await newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy);
    const signalReceipt = await signalTx.wait();
    const migrationSignaledEvents = filterEventsByABI(signalReceipt, [migrationSignaledEventABI]);
    expect(migrationSignaledEvents.length).to.equal(1);

    // Cancel the Migration request
    const cancelTx = await newFundDeployer.cancelMigration(vaultProxy);
    const cancelReceipt = await cancelTx.wait();
    const migrationCancelledEvents = filterEventsByABI(cancelReceipt, [migrationCancelledEventABI]);
    expect(migrationCancelledEvents.length).to.equal(1);
    const migrationCancelledEvent = migrationCancelledEvents[0].args;
    expect(migrationCancelledEvent.vaultProxy).to.equal(vaultProxy);
    expect(migrationCancelledEvent.prevFundDeployer).to.equal(fundDeployer.address);
    expect(migrationCancelledEvent.nextFundDeployer).to.equal(newFundDeployer.address);
    expect(migrationCancelledEvent.nextVaultAccessor).to.equal(newComptrollerProxy);
    expect(migrationCancelledEvent.nextVaultLib).to.equal(contracts.VaultLib);
  });

  it('Can not cancel the migration if the migration not signaled', async function () {
    // Cancel the Migration request
    await expect(newFundDeployer.cancelMigration(vaultProxy)).to.revertedWith(
      'cancelMigration: No migration request exists',
    );
    await expect(newFundDeployer.cancelMigrationEmergency(vaultProxy)).to.revertedWith(
      'cancelMigration: No migration request exists',
    );
  });

  it('Can not cancel the migration if the releaseStatus is not Live', async function () {
    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    // Initiating the Migration Config for a vault
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);

    await newFundDeployer.setReleaseStatus(2); // Setting the release status to Paused
    // Cancel the Migration request
    await expect(newFundDeployer.cancelMigration(vaultProxy)).to.revertedWith('Release is not Live');
  });

  it('Only the new fund deployer or migrator can cancel the migrations', async function () {
    await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    await newFundDeployer.setVaultLib(contracts.VaultLib);

    // Initiating the Migration Config for a vault
    const migrateTx = await newFundDeployer.createMigratedFundConfig(
      denominationAsset.address,
      '1',
      emptyConfigData,
      emptyConfigData,
    );
    const migrateReceipt = await migrateTx.wait();
    const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
    expect(comptrollerDeployedEvents.length).to.equal(1);
    const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
    newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

    // Signal the Migration to start
    const signalTx = await newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy);
    const signalReceipt = await signalTx.wait();
    const migrationSignaledEvents = filterEventsByABI(signalReceipt, [migrationSignaledEventABI]);
    expect(migrationSignaledEvents.length).to.equal(1);

    // Cancel the Migration request. It reverts because accounts[1] is not a migrator
    await expect(newFundDeployer.connect(accounts[1]).cancelMigration(vaultProxy)).to.revertedWith(
      'Only a permissioned migrator can call this function',
    );

    // Setting accounts[1] as migrator
    await vault.setMigrator(accounts[1].address);

    // accounts[1] initiating the Cancel Migration request. It should not be reverted
    await expect(newFundDeployer.connect(accounts[1]).cancelMigration(vaultProxy)).to.be.not.reverted;
  });

  describe('Migration with bypass enabled', function () {
    let mockFundDeployer;
    beforeEach(async function () {
      const MockFundDeployer = await ethers.getContractFactory('MockFundDeployer', deployer);
      mockFundDeployer = await MockFundDeployer.deploy(contracts.Dispatcher, contracts.FNDZController, [], []);
      await mockFundDeployer.deployed();
      expect(mockFundDeployer).to.be.an('object');

      const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
      const comptrollerLibForMock = await ComptrollerLib.deploy(
        dispatcher.address,
        mockFundDeployer.address,
        contracts.ValueInterpreter,
        contracts.FeeManager,
        contracts.IntegrationManager,
        contracts.PolicyManager,
        contracts.ChainlinkPriceFeed,
      );

      await mockFundDeployer.setComptrollerLib(comptrollerLibForMock.address);
      await mockFundDeployer.setVaultLib(contracts.VaultLib);
      await mockFundDeployer.setReleaseStatus(1);
    });

    it('Should be able to migrate with the bybass failure enabled', async function () {
      // In this old FundDeployer is the mocked one
      await dispatcher.setCurrentFundDeployer(mockFundDeployer.address);
      await fndzController.updateFundDeployerAddress(mockFundDeployer.address);

      // Creating a Fund on Mocked FundDeployer
      const newFundTx = await fndzController.createNewFund(
        deployer.address,
        'Test Bypass Vault',
        mockBUSD.address,
        '1',
        feeConfigData,
        policyConfigData,
      );
      const newFundReceipt = await newFundTx.wait();
      ({ comptrollerProxy, vaultProxy } = getFundAddresses(newFundReceipt));

      await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
      await newFundDeployer.setVaultLib(contracts.VaultLib);

      // Initiating the Migration Config for a vault
      const migrateTx = await newFundDeployer.createMigratedFundConfig(
        denominationAsset.address,
        '1',
        emptyConfigData,
        emptyConfigData,
      );
      const migrateReceipt = await migrateTx.wait();
      const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
      expect(comptrollerDeployedEvents.length).to.equal(1);
      const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
      newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

      // Signal Migration without bypass should fail on mockedFundDeployer
      await expect(newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy)).to.revertedWith(
        'Reverted for testing',
      );

      // Signal the Migration to start
      const signalTx = await newFundDeployer.signalMigrationEmergency(vaultProxy, newComptrollerProxy);
      const signalReceipt = await signalTx.wait();
      const migrationSignaledEvents = filterEventsByABI(signalReceipt, [migrationSignaledEventABI]);
      expect(migrationSignaledEvents.length).to.equal(1);

      // Advancing the time to complete the migrationTimeLock
      await advanceTime(migrationTimeLock);

      const executeTx = await newFundDeployer.executeMigrationEmergency(vaultProxy);
      const executeReceipt = await executeTx.wait();
      const migrationExecutedEvents = filterEventsByABI(executeReceipt, [migrationExecutedEventABI]);
      expect(migrationExecutedEvents.length).to.equal(1);
    });

    it('Should be able to cancel the migration request with bybass failure enabled', async function () {
      // In this both old and new FundDeployers were mocked.
      // Because cancelMigration has invokeCall for both old and new one
      // Migration between MockFundDeployer -> newMockFundDeployer
      await dispatcher.setCurrentFundDeployer(mockFundDeployer.address);
      await fndzController.updateFundDeployerAddress(mockFundDeployer.address);

      // Creating a Fund on Mocked FundDeployer
      const newFundTx = await fndzController.createNewFund(
        deployer.address,
        'Test Bypass Vault',
        mockBUSD.address,
        '1',
        feeConfigData,
        policyConfigData,
      );
      const newFundReceipt = await newFundTx.wait();
      ({ comptrollerProxy, vaultProxy } = getFundAddresses(newFundReceipt));

      // NewMockFundDeployer configs
      const MockFundDeployer = await ethers.getContractFactory('MockFundDeployer', deployer);
      const newMockFundDeployer = await MockFundDeployer.deploy(contracts.Dispatcher, contracts.FNDZController, [], []);
      await newMockFundDeployer.deployed();
      expect(newMockFundDeployer).to.be.an('object');

      const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
      const comptrollerLibForMock = await ComptrollerLib.deploy(
        dispatcher.address,
        newMockFundDeployer.address,
        contracts.ValueInterpreter,
        contracts.FeeManager,
        contracts.IntegrationManager,
        contracts.PolicyManager,
        contracts.ChainlinkPriceFeed,
      );

      await newMockFundDeployer.setComptrollerLib(comptrollerLibForMock.address);
      await newMockFundDeployer.setVaultLib(contracts.VaultLib);
      await newMockFundDeployer.setReleaseStatus(1);

      await dispatcher.setCurrentFundDeployer(newMockFundDeployer.address);
      await fndzController.updateFundDeployerAddress(newMockFundDeployer.address);

      // Initiating the Migration Config for a vault
      const migrateTx = await newMockFundDeployer.createMigratedFundConfig(
        denominationAsset.address,
        '1',
        emptyConfigData,
        emptyConfigData,
      );
      const migrateReceipt = await migrateTx.wait();
      const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
      expect(comptrollerDeployedEvents.length).to.equal(1);
      const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
      newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

      // Signal the Migration to start
      const signalTx = await newMockFundDeployer.signalMigrationEmergency(vaultProxy, newComptrollerProxy);
      const signalReceipt = await signalTx.wait();
      const migrationSignaledEvents = filterEventsByABI(signalReceipt, [migrationSignaledEventABI]);
      expect(migrationSignaledEvents.length).to.equal(1);

      // cancel migration without bypass failure should revert
      await expect(newMockFundDeployer.cancelMigration(vaultProxy)).to.revertedWith('Reverted for testing');

      // Cancel the Migration request
      const cancelTx = await newMockFundDeployer.cancelMigrationEmergency(vaultProxy);
      const cancelReceipt = await cancelTx.wait();
      const migrationCancelledEvents = filterEventsByABI(cancelReceipt, [migrationCancelledEventABI]);
      expect(migrationCancelledEvents.length).to.equal(1);
    });
  });

  describe('Tests on setMigrator of vault', function () {
    it('Should be able to set migrator of the vault', async function () {
      const setMigratorTx = await vault.setMigrator(accounts[1].address);
      const setMigratorReceipt = await setMigratorTx.wait();
      const migratorSetEvents = filterEventsByABI(setMigratorReceipt, [migratorSetEventABI]);
      expect(migratorSetEvents.length).to.equal(1);
      const migratorSetEvent = migratorSetEvents[0].args;
      expect(migratorSetEvent.prevMigrator).to.equal(ethers.constants.AddressZero);
      expect(migratorSetEvent.nextMigrator).to.equal(accounts[1].address);
    });
    it('only the owner can set the migrator of the vault', async function () {
      await expect(vault.connect(accounts[1]).setMigrator(accounts[1].address)).to.revertedWith(
        'setMigrator: Only the owner can call this function',
      );
    });
    it('cant set the same migrator twice', async function () {
      await vault.setMigrator(accounts[1].address);
      await expect(vault.setMigrator(accounts[1].address)).to.revertedWith('setMigrator: Value already set');
    });
  });

  describe('Tests on migration related Dispatcher methods', function () {
    beforeEach(async function () {
      // Initiate the Migration
      const migrateTx = await newFundDeployer.createMigratedFundConfig(
        contracts.mockTokens.MockBUSD,
        '1',
        emptyConfigData,
        emptyConfigData,
      );
      const migrateReceipt = await migrateTx.wait();
      const comptrollerDeployedEvents = filterEventsByABI(migrateReceipt, [comptrollerProxyDeployedEventABI]);
      expect(comptrollerDeployedEvents.length).to.equal(1);
      const comptrollerDeployedEvent = comptrollerDeployedEvents[0].args;
      newComptrollerProxy = comptrollerDeployedEvent.comptrollerProxy;

      await dispatcher.setCurrentFundDeployer(newFundDeployer.address);
    });

    describe('getTimelockRemainingForMigrationRequest', () => {
      it('returns remaining time lock for migration else zero', async function () {
        // When there is no migration request for a vault, it returns 0
        expect(await dispatcher.getTimelockRemainingForMigrationRequest(vaultProxy)).to.equal(0);

        // Signalling the migration
        await newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy);

        // When migrationTimelock not completed
        expect((await dispatcher.getTimelockRemainingForMigrationRequest(vaultProxy)).gt(0)).to.be.true;

        // Advancing the time to complete the migrationTimelock
        await advanceTime(migrationTimeLock);
        await ethers.provider.send('evm_mine');

        // After completed migrationTimelock, it returns 0
        expect(await dispatcher.getTimelockRemainingForMigrationRequest(vaultProxy)).to.equal(0);
      });
    });

    describe('hasMigrationRequest', () => {
      it('returns false if vault does not have any migration request', async () => {
        expect(await dispatcher.hasMigrationRequest(vaultProxy)).to.be.false;
      });

      it('returns true if vault has the migration request', async () => {
        // Signalling the migration
        await newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy);
        expect(await dispatcher.hasMigrationRequest(vaultProxy)).to.be.true;
      });
    });

    describe('hasExecutableMigrationRequest', () => {
      it('returns false if vault does not have executable migration request', async () => {
        expect(await dispatcher.hasExecutableMigrationRequest(vaultProxy)).to.be.false;

        // Signalling the migration
        await newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy);
        expect(await dispatcher.hasExecutableMigrationRequest(vaultProxy)).to.be.false;
      });

      it('returns true if vault has the executable migration request', async () => {
        // Signalling the migration
        await newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy);

        // Advancing the time to complete the migrationTimelock
        await advanceTime(migrationTimeLock);
        await ethers.provider.send('evm_mine');

        expect(await dispatcher.hasExecutableMigrationRequest(vaultProxy)).to.be.true;
      });
    });

    describe('cancelMigration', () => {
      it('Only the permissioned migrator can call', async function () {
        // Signalling the migration
        await newFundDeployer.signalMigration(vaultProxy, newComptrollerProxy);

        await expect(dispatcher.connect(accounts[1]).cancelMigration(vaultProxy, false)).to.revertedWith(
          'cancelMigration: Not an allowed caller',
        );
      });
    });
  });
});
