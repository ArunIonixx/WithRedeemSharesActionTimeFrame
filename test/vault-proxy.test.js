/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { emptyConfigData, getFundAddresses, filterEventsByABI } = require('./utils/fndz-utilities.js');
const { utils } = require('ethers');

/* eslint-enable @typescript-eslint/no-var-requires */

let contractAddresses;
let accounts;
let deployer;
let vaultProxy;
let dispatcher;
const fundName = 'TEST FUND';
let fundOwner;
let comptrollerLib;
let integrationManager;
let fndzController;
let mockBUSD;
beforeEach(async function () {
  contractAddresses = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];

  const Dispatcher = await ethers.getContractFactory('Dispatcher', deployer);
  dispatcher = Dispatcher.attach(contractAddresses.Dispatcher);

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contractAddresses.FNDZController);

  const IntegrationManager = await ethers.getContractFactory('IntegrationManager', deployer);
  integrationManager = IntegrationManager.attach(contractAddresses.IntegrationManager);

  //fundOwner = await createRandomAddress();
  fundOwner = accounts[0];

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  mockBUSD = MockToken.attach(contractAddresses.mockTokens.MockBUSD);
  expect(mockBUSD).to.be.an('object');

  const newFundTx = await fndzController.createNewFund(
    deployer.address,
    fundName,
    mockBUSD.address,
    '1',
    emptyConfigData,
    emptyConfigData,
  );
  const newFundReceipt = await newFundTx.wait();
  const { comptrollerProxy: comptrollerAddress, vaultProxy: vaultProxyAddress } = getFundAddresses(newFundReceipt);
  const VaultProxy = await ethers.getContractFactory('VaultLib', deployer);
  vaultProxy = VaultProxy.attach(vaultProxyAddress);

  const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
  comptrollerLib = ComptrollerLib.attach(comptrollerAddress);
});

describe('VaultProxy tests', () => {
  it('Should match vault proxy creater with dispatcher ', async () => {
    const creatorValue = await vaultProxy.getCreator();
    expect(creatorValue).to.equal(dispatcher.address);
  });
  it('Should match migrator value with AddressZero ', async () => {
    const migratorValue = await vaultProxy.getMigrator();
    expect(migratorValue).to.equal(ethers.constants.AddressZero);
  });
  it('Should match vault owner value with Fund Owner Address ', async () => {
    const ownerValue = await vaultProxy.getOwner();
    expect(ownerValue).to.equal(fundOwner.address);
  });
  it('Should match vault proxy name with fund name ', async () => {
    const nameValue = await vaultProxy.name();
    expect(nameValue).to.equal(fundName);
  });

  it('Should match vault proxy symbol with fund Denomination asset ', async () => {
    const symbolValue = await vaultProxy.symbol();
    expect(symbolValue).to.equal('vFNDZ');
  });

  it('Should match vault proxy decimal length to 18 ', async () => {
    const decimalsValue = await vaultProxy.decimals();
    expect(decimalsValue).to.equal(18);
  });

  it('Should revert approve with Unimplemented', async () => {
    await expect(
      vaultProxy.approve(ethers.Wallet.createRandom().address, ethers.BigNumber.from('1')),
    ).to.be.revertedWith('Unimplemented');
  });

  it('Should revert transfer with Unimplemented', async () => {
    await expect(
      vaultProxy.transfer(ethers.Wallet.createRandom().address, ethers.BigNumber.from('1')),
    ).to.be.revertedWith('Unimplemented');
  });

  it('Should revert transferFrom with Unimplemented', async () => {
    await expect(
      vaultProxy.transferFrom(
        ethers.Wallet.createRandom().address,
        ethers.Wallet.createRandom().address,
        ethers.BigNumber.from('1'),
      ),
    ).to.be.revertedWith('Unimplemented');
  });

  it('Add Tracked Asset cannot be called by an unauthorized user on the fund', async () => {
    const args = [contractAddresses.mockTokens.MockUSDC];
    expect(await vaultProxy.isTrackedAsset(contractAddresses.mockTokens.MockUSDC)).to.be.false;

    var encodedAddresses = ethers.utils.defaultAbiCoder.encode(['address[]'], [args]);
    await expect(
      comptrollerLib
        .connect(accounts[1])
        .callOnExtension(integrationManager.address, ethers.BigNumber.from('1'), encodedAddresses),
    ).to.be.revertedWith('Not an authorized user');
  });

  it('Should allow an authorized user on the fund to add a zero balance tracked asset', async () => {
    const args = [contractAddresses.mockTokens.MockUSDC];
    var encodedAddresses = ethers.utils.defaultAbiCoder.encode(['address[]'], [args]);
    var trackedAssetResultTx = await comptrollerLib.callOnExtension(
      integrationManager.address,
      ethers.BigNumber.from('1'),
      encodedAddresses,
    );
    const receipt = await trackedAssetResultTx.wait();
    expect(receipt.status).to.equal(1);

    const trackedAssetEvent = filterEventsByABI(receipt, ['event TrackedAssetAdded(address asset)']);
    expect(trackedAssetEvent.length).to.equal(1);
    expect(contractAddresses.mockTokens.MockUSDC).to.equal(trackedAssetEvent[0].args.asset);

    expect(await vaultProxy.isTrackedAsset(contractAddresses.mockTokens.MockUSDC)).to.be.true;
  });

  it('Should allow an authorized user on the fund to add a non-zero balance tracked asset', async () => {
    const USDCToken = await ethers.getContractFactory('MockToken', deployer);
    const mockUSDC = USDCToken.attach(contractAddresses.mockTokens.MockUSDC);
    const mintTx = await mockUSDC.mintFor(deployer.address, ethers.BigNumber.from('10000000000000000000000'));
    const mintReceipt = await mintTx.wait();
    expect(mintReceipt.status).to.equal(1);

    const transferTx = await mockUSDC.transfer(vaultProxy.address, ethers.utils.parseEther('1'));
    const transferReceipt = await transferTx.wait();
    expect(transferReceipt.status).to.equal(1);

    const args = [mockUSDC.address];
    var encodedAddresses = ethers.utils.defaultAbiCoder.encode(['address[]'], [args]);
    var trackedAssetResultTx = await comptrollerLib.callOnExtension(
      integrationManager.address,
      ethers.BigNumber.from('1'),
      encodedAddresses,
    );
    const receipt = await trackedAssetResultTx.wait();
    expect(receipt.status).to.equal(1);

    const trackedAssetEvent = filterEventsByABI(receipt, ['event TrackedAssetAdded(address asset)']);
    expect(trackedAssetEvent.length).to.equal(1);
    expect(contractAddresses.mockTokens.MockUSDC).to.equal(trackedAssetEvent[0].args.asset);

    expect(await vaultProxy.isTrackedAsset(contractAddresses.mockTokens.MockUSDC)).to.be.true;
  });

  it('Should not able to remove non-zero balance tracked asset', async () => {
    // verify USDC is not a tracked asset
    expect(await vaultProxy.isTrackedAsset(contractAddresses.mockTokens.MockUSDC)).to.be.false;

    const USDCToken = await ethers.getContractFactory('MockToken', deployer);
    const mockUSDC = USDCToken.attach(contractAddresses.mockTokens.MockUSDC);
    const mintTx = await mockUSDC.mintFor(deployer.address, ethers.BigNumber.from('10000000000000000000000'));
    const mintReceipt = await mintTx.wait();
    expect(mintReceipt.status).to.equal(1);

    const transferTx = await mockUSDC.transfer(vaultProxy.address, ethers.utils.parseEther('1'));
    const transferReceipt = await transferTx.wait();
    expect(transferReceipt.status).to.equal(1);

    const args = [mockUSDC.address];

    var encodedAddresses = ethers.utils.defaultAbiCoder.encode(['address[]'], [args]);
    //add USDC as a tracked asset
    var trackedAssetResult = await comptrollerLib.callOnExtension(
      integrationManager.address,
      ethers.BigNumber.from('1'),
      encodedAddresses,
    );
    const tx = await trackedAssetResult.wait();
    expect(tx.status).to.equal(1);

    // verify USDC is a tracked asset
    expect(await vaultProxy.isTrackedAsset(mockUSDC.address)).to.be.true;
    // remove added tracked asset
    await expect(
      comptrollerLib.callOnExtension(integrationManager.address, ethers.BigNumber.from('2'), encodedAddresses),
    ).to.be.revertedWith(' Balance is not zero');
  });

  it('remove tracked Asset', async () => {
    const args = [contractAddresses.mockTokens.MockUSDC];
    // verify USDC is not a tracked asset
    expect(await vaultProxy.isTrackedAsset(contractAddresses.mockTokens.MockUSDC)).to.be.false;

    var encodedAddresses = ethers.utils.defaultAbiCoder.encode(['address[]'], [args]);
    // add USDC as a tracked asset
    var trackedAssetResult = await comptrollerLib.callOnExtension(
      integrationManager.address,
      ethers.BigNumber.from('1'),
      encodedAddresses,
    );
    const tx = await trackedAssetResult.wait();
    expect(tx.status).to.equal(1);
    //verify USDC is a tracked asset
    expect(await vaultProxy.isTrackedAsset(contractAddresses.mockTokens.MockUSDC)).to.be.true;
    // remove added tracked asset
    var removeTrackedAssetResult = await comptrollerLib.callOnExtension(
      integrationManager.address,
      ethers.BigNumber.from('2'),
      encodedAddresses,
    );
    const removeTx = await removeTrackedAssetResult.wait();
    expect(removeTx.status).to.equal(1);
    const trackedAssetEvent = filterEventsByABI(removeTx, ['event TrackedAssetRemoved(address asset)']);
    expect(trackedAssetEvent.length).to.equal(1);
    expect(contractAddresses.mockTokens.MockUSDC).to.equal(trackedAssetEvent[0].args.asset);

    // verify USDC is a tracked asset
    expect(await vaultProxy.isTrackedAsset(contractAddresses.mockTokens.MockUSDC)).to.be.false;
  });

  it('Removed Tracked Asset cannot be called by an unauthorized user on the fund', async () => {
    const args = [contractAddresses.mockTokens.MockUSDC];
    expect(await vaultProxy.isTrackedAsset(contractAddresses.mockTokens.MockUSDC)).to.be.false;

    var encodedAddresses = ethers.utils.defaultAbiCoder.encode(['address[]'], [args]);
    await expect(
      comptrollerLib
        .connect(accounts[1])
        .callOnExtension(integrationManager.address, ethers.BigNumber.from('2'), encodedAddresses),
    ).to.be.revertedWith('Not an authorized user');
  });

  it('Withdraw Asset To can only be called by the accessor', async () => {
    await expect(
      vaultProxy
        .connect(deployer)
        .withdrawAssetTo(
          contractAddresses.mockTokens.MockDai,
          await ethers.Wallet.createRandom().address,
          ethers.utils.parseEther('2'),
        ),
    ).to.be.revertedWith('Only the designated accessor can make this call');
  });

  it('callOnContract cannot be called directly', async () => {
    const args = [contractAddresses.mockTokens.MockUSDC];
    expect(await vaultProxy.isTrackedAsset(contractAddresses.mockTokens.MockUSDC)).to.be.false;

    var encodedAddresses = ethers.utils.defaultAbiCoder.encode(['address[]'], [args]);
    await expect(vaultProxy.callOnContract(integrationManager.address, encodedAddresses)).to.be.revertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('approveAssetSpender cannot be called directly', async () => {
    await expect(
      vaultProxy.approveAssetSpender(
        contractAddresses.mockTokens.MockUSDC,
        deployer.address,
        ethers.BigNumber.from('1'),
      ),
    ).to.be.revertedWith('Only the designated accessor can make this call');
  });

  it('redeemVirtualShares cannot be called directly', async () => {
    await expect(vaultProxy.redeemVirtualShares(deployer.address, ethers.BigNumber.from('1'))).to.be.revertedWith(
      'Only the designated accessor can make this call',
    );
  });
  it('redeemAndSwapVirtualShares cannot be called directly', async () => {
    await expect(
      vaultProxy.redeemAndSwapVirtualShares(deployer.address, ethers.BigNumber.from('1')),
    ).to.be.revertedWith('Only the designated accessor can make this call');
  });
  it('burnShares cannot be called directly', async () => {
    await expect(vaultProxy.burnShares(deployer.address, ethers.BigNumber.from('1'))).to.be.revertedWith(
      'Only the designated accessor can make this call',
    );
  });

  it('mintShares cannot be called directly', async () => {
    await expect(vaultProxy.mintShares(deployer.address, ethers.BigNumber.from('1'))).to.be.revertedWith(
      'Only the designated accessor can make this call',
    );
  });
  it('transferShares cannot be called directly', async () => {
    await expect(
      vaultProxy.transferShares(deployer.address, ethers.Wallet.createRandom().address, ethers.BigNumber.from('1')),
    ).to.be.revertedWith('Only the designated accessor can make this call');
  });
  it('swapAndWithdrawAssetTo cannot be called directly', async () => {
    await expect(
      vaultProxy.swapAndWithdrawAssetTo(
        ethers.Wallet.createRandom().address,
        ethers.Wallet.createRandom().address,
        ethers.Wallet.createRandom().address,
        ethers.BigNumber.from('1'),
        ethers.BigNumber.from('1'),
        ethers.BigNumber.from('1'),
        [ethers.Wallet.createRandom().address, ethers.Wallet.createRandom().address],
      ),
    ).to.be.revertedWith('Only the designated accessor can make this call');
  });

  it('addTrackedAsset cannot be called directly', async () => {
    await expect(vaultProxy.addTrackedAsset(contractAddresses.mockTokens.MockUSDC)).to.be.revertedWith(
      'Only the designated accessor can make this call',
    );
  });
  it('removeTrackedAsset cannot be called directly', async () => {
    await expect(vaultProxy.removeTrackedAsset(contractAddresses.mockTokens.MockUSDC)).to.be.revertedWith(
      'Only the designated accessor can make this call',
    );
  });
  it('swapAsset is only accessible by the respective comptroller', async function () {
    await expect(
      vaultProxy.swapAsset(
        contractAddresses.mockTokens.MockBUSD,
        contractAddresses.mockTokens.MockDai,
        utils.parseEther('1'),
      ),
    ).to.revertedWith('Only the designated accessor can make this call');
  });
});
