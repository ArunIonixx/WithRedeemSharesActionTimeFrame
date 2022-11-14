/* eslint-disable @typescript-eslint/no-var-requires */
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployments } = require('./utils/deploy-test-contracts.js');
const {
  emptyConfigData,
  extractEventArgs,
  filterEventsByABI,
  getFundAddresses,
  advanceTime,
  sharesRedeemedABI,
  transferABI,
} = require('./utils/fndz-utilities.js');
const { managementFeeSharesDue, convertRateToScaledPerSecondRate } = require('./utils/management-fee.js');
/* eslint-enable @typescript-eslint/no-var-requires */

// One year in seconds - 1
const timeIncrement = 31535999;

let accounts;
let deployer;
let contractAddresses;
let comptroller;
let vault;
let mockBUSD;
let mockDai;
let managementFee;
let fundDeployer;
let fundActionsWrapper;
let fndzController;

let fndzStakingPool;
let fndzDao;

let vaultOwner;
let investor1;
let investor2;

const settledEventABI =
  'event Settled(address indexed comptrollerProxy, uint256 sharesQuantity, uint256 secondsSinceSettlement)';

beforeEach(async function () {
  // runs before each test in this block
  contractAddresses = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];

  vaultOwner = accounts[0];
  investor1 = accounts[1];
  investor2 = accounts[2];

  const FundDeployer = await ethers.getContractFactory('FundDeployer', deployer);
  fundDeployer = FundDeployer.attach(contractAddresses.FundDeployer);
  expect(fundDeployer).to.be.an('object');

  const FundActionsWrapper = await ethers.getContractFactory('FundActionsWrapper', deployer);
  fundActionsWrapper = FundActionsWrapper.attach(contractAddresses.FundActionsWrapper);
  expect(fundActionsWrapper).to.be.an('object');

  const ManagementFee = await ethers.getContractFactory('ManagementFee', deployer);
  managementFee = ManagementFee.attach(contractAddresses.ManagementFee);
  expect(managementFee).to.be.an('object');

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  mockBUSD = MockToken.attach(contractAddresses.mockTokens.MockBUSD);
  expect(mockBUSD).to.be.an('object');

  mockDai = MockToken.attach(contractAddresses.mockTokens.MockDai);
  expect(mockDai).to.be.an('object');

  for (let i = 1; i < 6; i += 1) {
    await mockBUSD.mintFor(accounts[i].address, BigNumber.from('10000000000000000000000')); // 10k BUSD
  }

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contractAddresses.FNDZController);
  expect(fndzController).to.be.an('object');

  fndzStakingPool = await fndzController.fndzStakingPool();
  fndzDao = await fndzController.fndzDao();
});

describe('Management Fee Suite (Vault Setup)', function () {
  it('Sets the scaledPerSecond rate correctly', async function () {
    const onePercentScaledPerSecondRate = convertRateToScaledPerSecondRate(utils.parseEther('0.01'));
    const abiCoder = new ethers.utils.AbiCoder();
    const encodedFeeParams = abiCoder.encode(['uint'], [onePercentScaledPerSecondRate]);
    const encodedFeeData = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [[contractAddresses.ManagementFee], [encodedFeeParams]],
    );

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'Management Fee Test',
      mockBUSD.address,
      '1',
      encodedFeeData,
      emptyConfigData,
    );
    const newFundReceipt = await newFundTx.wait();
    const { comptrollerProxy: comptrollerAddress } = getFundAddresses(newFundReceipt);
    const fundSettingsAddedEvents = filterEventsByABI(newFundReceipt, [
      'event FundSettingsAdded(address indexed comptrollerProxy, uint256 scaledPerSecondRate)',
    ]);
    expect(fundSettingsAddedEvents.length).to.equal(1);
    const {
      args: { comptrollerProxy, scaledPerSecondRate },
    } = fundSettingsAddedEvents[0];
    expect(comptrollerAddress).to.equal(comptrollerProxy);
    expect(scaledPerSecondRate).to.equal(BigNumber.from('1000000000318694059332284760')); // hardcoded onePercentScaledPerSecondRate to ensure calculation accuracy
  });
  it('Does not allow a scaledPerSecondRate of 0', async function () {
    const abiCoder = new ethers.utils.AbiCoder();
    const encodedFeeParams = abiCoder.encode(['uint'], [0]);
    const encodedFeeData = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [[contractAddresses.ManagementFee], [encodedFeeParams]],
    );

    await expect(
      fndzController.createNewFund(
        deployer.address,
        'Management Fee Test',
        mockBUSD.address,
        '1',
        encodedFeeData,
        emptyConfigData,
      ),
    ).to.be.revertedWith('addFundSettings: scaledPerSecondRate must be greater than 0');
  });
});

describe('Management Fee Suite (Vault Denomination Asset == FNDZ DAO Desired Currency)', function () {
  let firstVaultDepositAmount;
  let vaultDenominationAsset;
  beforeEach(async function () {
    firstVaultDepositAmount = ethers.utils.parseEther('500'); // 500 BUSD in wei
    vaultDenominationAsset = mockBUSD;

    // Create Vault
    const onePercentScaledPerSecondRate = convertRateToScaledPerSecondRate(utils.parseEther('0.01'));
    const abiCoder = new ethers.utils.AbiCoder();
    const encodedFeeParams = abiCoder.encode(['uint'], [onePercentScaledPerSecondRate]);
    const encodedFeeData = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [[contractAddresses.ManagementFee], [encodedFeeParams]],
    );

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'Management Fee Test',
      vaultDenominationAsset.address,
      '1',
      encodedFeeData,
      emptyConfigData,
    );
    const newFundReceipt = await newFundTx.wait();

    const { comptrollerProxy, vaultProxy } = getFundAddresses(newFundReceipt);

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    comptroller = ComptrollerLib.attach(comptrollerProxy);
    expect(comptroller).to.be.an('object');

    const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
    vault = VaultLib.attach(vaultProxy);
    expect(vault).to.be.an('object');

    // Initial Deposit
    await vaultDenominationAsset.connect(investor1).approve(comptroller.address, firstVaultDepositAmount);
    const buySharesTx = await comptroller
      .connect(investor1)
      .buyShares(firstVaultDepositAmount, 0, ethers.constants.AddressZero);
    const buySharesReceipt = await buySharesTx.wait();

    const settledEvents = filterEventsByABI(buySharesReceipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(0);
  });
  it('Does not trigger management fee during first shares purchase', async function () {
    expect(await vault.balanceOf(vaultOwner.address)).to.equal(0);
    expect(await vaultDenominationAsset.balanceOf(fndzStakingPool)).to.equal(0);
    expect(await vaultDenominationAsset.balanceOf(fndzDao)).to.equal(0);
  });
  it('Should be able to get the fee info', async function () {
    const onePercentScaledPerSecondRate = convertRateToScaledPerSecondRate(utils.parseEther('0.01'));
    // Verifying the getFeeInfoForFund
    const feeInfo = await managementFee.getFeeInfoForFund(comptroller.address);
    expect(feeInfo.scaledPerSecondRate).to.equal(onePercentScaledPerSecondRate);
  });
  it('Triggers management fee of 1% when invoking continuous hook after one year', async function () {
    const previousVaultSharesTotalSupply = await vault.totalSupply();
    await advanceTime(timeIncrement); // 1 year since vault creation
    const tx = await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(comptroller.address, [
      managementFee.address,
    ]);
    const receipt = await tx.wait();

    // ManagementFee Settled event
    const settledEvents = filterEventsByABI(receipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(1);
    const {
      args: { comptrollerProxy, sharesQuantity, secondsSinceSettlement },
    } = settledEvents[0];
    expect(comptrollerProxy).to.equal(comptroller.address);

    // Check that total number of shares (including virtual) matches what is expected
    const expectedTotalSharesDue = managementFeeSharesDue(
      convertRateToScaledPerSecondRate(utils.parseEther('0.01')),
      previousVaultSharesTotalSupply,
      secondsSinceSettlement,
    );
    expect(expectedTotalSharesDue.sub(sharesQuantity).toNumber()).to.be.lessThan(10); // to handle rounding error
    expect(secondsSinceSettlement).to.equal(BigNumber.from(timeIncrement));

    // ComptrollerLib SharesRedeemed event
    const sharesRedeemedEvents = filterEventsByABI(receipt, [sharesRedeemedABI]);
    expect(sharesRedeemedEvents.length).to.equal(2);

    // VaultLib (and token) Transfer events
    const transferEvents = filterEventsByABI(receipt, [transferABI]);
    // 2 transfer events of virtual shares being redeemed and paid out as
    // vault assets, 1 transfer event of vault owner shares being minted
    expect(transferEvents.length).to.equal(3);
    // Transfer events of the denomination asset being sent to staking and dao
    const denominationAssetTransferEvents = transferEvents.filter((event) => event.args.from === vault.address);
    expect(denominationAssetTransferEvents.length).to.equal(sharesRedeemedEvents.length);
    // Transfer event of vault owner shares being minted
    const ownerShareTransferEvents = transferEvents.filter(
      (event) => event.args.from === ethers.constants.AddressZero && event.args.to === vaultOwner.address,
    );
    expect(ownerShareTransferEvents.length).to.equal(1);
    const sharesMintedToVaultOwner = ownerShareTransferEvents[0].args.value;

    // Total number of virtual shares
    const totalVirtualSharesRedeemed = sharesRedeemedEvents.reduce((total, currentEvent) => {
      if (currentEvent.args.isVirtual) {
        total = total.add(currentEvent.args.sharesQuantity);
      }
      return total;
    }, BigNumber.from('0'));

    // Check that owner shares + virtual shares == total number of shares created
    expect(sharesQuantity).to.equal(sharesMintedToVaultOwner.add(totalVirtualSharesRedeemed));

    // Check that denomination asset Transfer events correspond with ComptrollerLib SharesRedeemed events
    for (let i = 0; i < sharesRedeemedEvents.length; i += 1) {
      expect(sharesRedeemedEvents[i].args.receivedAssets.length).to.equal(1);
      expect(sharesRedeemedEvents[i].args.receivedAssetQuantities.length).to.equal(1);
      expect(sharesRedeemedEvents[i].args.receivedAssets[0]).to.equal(vaultDenominationAsset.address);
      expect(sharesRedeemedEvents[i].args.receivedAssetQuantities[0]).to.equal(
        denominationAssetTransferEvents[i].args.value,
      );
      expect(sharesRedeemedEvents[i].args.redeemer).to.equal(denominationAssetTransferEvents[i].args.to);
      expect(sharesRedeemedEvents[i].args.isVirtual).to.equal(true);
    }
    const stakingPoolReceivedAssetBalance = denominationAssetTransferEvents[0].args.value;
    const fndzDaoPoolReceivedAssetBalance = denominationAssetTransferEvents[1].args.value;

    const vaultSharesTotalSupply = await vault.totalSupply();
    const vaultOwnerShareBalance = await vault.balanceOf(vaultOwner.address);
    const vaultDenominationAssetBalance = await vaultDenominationAsset.balanceOf(vault.address);
    const stakingPoolDenominationAssetBalance = await vaultDenominationAsset.balanceOf(fndzStakingPool);
    const fndzDaoDenominationAssetBalance = await vaultDenominationAsset.balanceOf(fndzDao);

    expect(stakingPoolDenominationAssetBalance).to.equal(stakingPoolReceivedAssetBalance);
    expect(fndzDaoDenominationAssetBalance).to.equal(fndzDaoPoolReceivedAssetBalance);

    expect(vaultOwnerShareBalance / vaultSharesTotalSupply).to.equal(0.005025125468797698);
    expect(stakingPoolDenominationAssetBalance / vaultDenominationAssetBalance).to.equal(0.002518875705893139);
    expect(fndzDaoDenominationAssetBalance / vaultDenominationAssetBalance).to.equal(0.002512562734398849);
  });
  it('Triggers management fee of 1% when buying shares after one year', async function () {
    const previousVaultSharesTotalSupply = await vault.totalSupply();
    await vaultDenominationAsset.connect(investor2).approve(comptroller.address, ethers.utils.parseEther('200'));
    await advanceTime(timeIncrement); // 1 year since vault creation
    const tx = await comptroller
      .connect(investor2)
      .buyShares(ethers.utils.parseEther('200'), 0, ethers.constants.AddressZero);
    const receipt = await tx.wait();

    const { sharesReceived } = extractEventArgs(receipt, 'SharesBought');

    // ManagementFee Settled event
    const settledEvents = filterEventsByABI(receipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(1);
    const {
      args: { comptrollerProxy, sharesQuantity, secondsSinceSettlement },
    } = settledEvents[0];
    expect(comptrollerProxy).to.equal(comptroller.address);

    // Check that total number of shares (including virtual) matches what is expected
    const expectedTotalSharesDue = managementFeeSharesDue(
      convertRateToScaledPerSecondRate(utils.parseEther('0.01')),
      previousVaultSharesTotalSupply.add(sharesReceived), // management fee is settled after new investor shares are minted
      secondsSinceSettlement,
    );
    expect(expectedTotalSharesDue.sub(sharesQuantity).toNumber()).to.be.lessThan(10); // to handle rounding error
    expect(secondsSinceSettlement).to.equal(BigNumber.from(timeIncrement + 1));

    // ComptrollerLib SharesRedeemed event
    const sharesRedeemedEvents = filterEventsByABI(receipt, [sharesRedeemedABI]);
    expect(sharesRedeemedEvents.length).to.equal(2);

    // VaultLib (and token) Transfer events
    const transferEvents = filterEventsByABI(receipt, [transferABI]);
    // 2 transfer events of virtual shares being redeemed and paid out as
    // vault assets, 1 transfer event of vault owner shares being minted,
    // 1 transfer event of new investor depositing denomination asset,
    // 1 transfer event of new investor shares being minted
    expect(transferEvents.length).to.equal(5);
    // Transfer events of the denomination asset being sent to staking and dao
    const denominationAssetTransferEvents = transferEvents.filter((event) => event.args.from === vault.address);
    expect(denominationAssetTransferEvents.length).to.equal(sharesRedeemedEvents.length);
    // Transfer event of vault owner shares being minted
    const ownerShareTransferEvents = transferEvents.filter(
      (event) => event.args.from === ethers.constants.AddressZero && event.args.to === vaultOwner.address,
    );
    expect(ownerShareTransferEvents.length).to.equal(1);
    const sharesMintedToVaultOwner = ownerShareTransferEvents[0].args.value;

    // Total number of virtual shares
    const totalVirtualSharesRedeemed = sharesRedeemedEvents.reduce((total, currentEvent) => {
      if (currentEvent.args.isVirtual) {
        total = total.add(currentEvent.args.sharesQuantity);
      }
      return total;
    }, BigNumber.from('0'));

    // Check that owner shares + virtual shares == total number of shares created
    expect(sharesQuantity).to.equal(sharesMintedToVaultOwner.add(totalVirtualSharesRedeemed));

    // Check that denomination asset Transfer events correspond with ComptrollerLib SharesRedeemed events
    for (let i = 0; i < sharesRedeemedEvents.length; i += 1) {
      expect(sharesRedeemedEvents[i].args.receivedAssets.length).to.equal(1);
      expect(sharesRedeemedEvents[i].args.receivedAssetQuantities.length).to.equal(1);
      expect(sharesRedeemedEvents[i].args.receivedAssets[0]).to.equal(vaultDenominationAsset.address);
      expect(sharesRedeemedEvents[i].args.receivedAssetQuantities[0]).to.equal(
        denominationAssetTransferEvents[i].args.value,
      );
      expect(sharesRedeemedEvents[i].args.redeemer).to.equal(denominationAssetTransferEvents[i].args.to);
      expect(sharesRedeemedEvents[i].args.isVirtual).to.equal(true);
    }
    const stakingPoolReceivedAssetBalance = denominationAssetTransferEvents[0].args.value;
    const fndzDaoPoolReceivedAssetBalance = denominationAssetTransferEvents[1].args.value;

    const vaultSharesTotalSupply = await vault.totalSupply();
    const vaultOwnerShareBalance = await vault.balanceOf(vaultOwner.address);
    const vaultDenominationAssetBalance = await vaultDenominationAsset.balanceOf(vault.address);
    const stakingPoolDenominationAssetBalance = await vaultDenominationAsset.balanceOf(fndzStakingPool);
    const fndzDaoDenominationAssetBalance = await vaultDenominationAsset.balanceOf(fndzDao);

    expect(stakingPoolDenominationAssetBalance).to.equal(stakingPoolReceivedAssetBalance);
    expect(fndzDaoDenominationAssetBalance).to.equal(fndzDaoPoolReceivedAssetBalance);

    expect(vaultOwnerShareBalance / vaultSharesTotalSupply).to.equal(0.005025125628140704);
    expect(stakingPoolDenominationAssetBalance / vaultDenominationAssetBalance).to.equal(0.002518875785965001);
    expect(fndzDaoDenominationAssetBalance / vaultDenominationAssetBalance).to.equal(0.002512562814070352);
  });
  it('Should transfer shares to fndzStaking and fndzDao instead of assets if the transfer failed', async function () {
    expect(await vault.balanceOf(fndzDao)).to.equal(0);
    expect(await vault.balanceOf(fndzStakingPool)).to.equal(0);
    // Pausing the Denomination to Make the Transfer Fail
    await mockBUSD.pause();

    const previousVaultSharesTotalSupply = await vault.totalSupply();
    await advanceTime(timeIncrement); // 1 year since vault creation
    const tx = await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(comptroller.address, [
      managementFee.address,
    ]);
    const receipt = await tx.wait();

    // ManagementFee Settled event
    const settledEvents = filterEventsByABI(receipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(1);
    const {
      args: { comptrollerProxy, sharesQuantity, secondsSinceSettlement },
    } = settledEvents[0];
    expect(comptrollerProxy).to.equal(comptroller.address);

    // Check that total number of shares (including virtual) matches what is expected
    const expectedTotalSharesDue = managementFeeSharesDue(
      convertRateToScaledPerSecondRate(utils.parseEther('0.01')),
      previousVaultSharesTotalSupply,
      secondsSinceSettlement,
    );
    expect(expectedTotalSharesDue.sub(sharesQuantity).toNumber()).to.be.lessThan(10); // to handle rounding error
    expect(secondsSinceSettlement.sub(timeIncrement).toNumber()).to.lessThan(2);

    // VaultLib (and token) Transfer events
    const transferEvents = filterEventsByABI(receipt, [transferABI]);
    // 3 transfer events being minted and transferred to owner, fndzStaking and fndzDao
    expect(transferEvents.length).to.equal(3);
    // Transfer event of vault owner shares being minted
    const ownerShareTransferEvents = transferEvents.filter(
      (event) => event.args.from === ethers.constants.AddressZero && event.args.to === vaultOwner.address,
    );
    expect(ownerShareTransferEvents.length).to.equal(1);
    const sharesMintedToVaultOwner = ownerShareTransferEvents[0].args.value;
    // Transfer event of fndzStaking shares being minter
    const fndzStakingTransferEvents = transferEvents.filter(
      (event) => event.args.from == ethers.constants.AddressZero && event.args.to == fndzStakingPool,
    );
    expect(fndzStakingTransferEvents.length).to.equal(1);
    const sharesMintedToFndzStaking = fndzStakingTransferEvents[0].args.value;
    // Transfer event of fndzDao shares being minter
    const fndzDaoTransferEvents = transferEvents.filter(
      (event) => event.args.from == ethers.constants.AddressZero && event.args.to == fndzDao,
    );
    expect(fndzDaoTransferEvents.length).to.equal(1);
    const sharesMintedToFndzDao = fndzDaoTransferEvents[0].args.value;
    // Check that owner shares + virtual shares == total number of shares created
    expect(sharesQuantity).to.equal(sharesMintedToVaultOwner.add(sharesMintedToFndzStaking).add(sharesMintedToFndzDao));

    const vaultSharesTotalSupply = await vault.totalSupply();
    const vaultOwnerShareBalance = await vault.balanceOf(vaultOwner.address);
    const stakingPoolSharesBalance = await vault.balanceOf(fndzStakingPool);
    const fndzDaoSharesBalance = await vault.balanceOf(fndzDao);

    expect(sharesMintedToFndzStaking).to.equal(stakingPoolSharesBalance);
    expect(sharesMintedToFndzDao).to.equal(fndzDaoSharesBalance);

    expect(vaultOwnerShareBalance / vaultSharesTotalSupply).to.equal(0.005);
    expect(stakingPoolSharesBalance / vaultSharesTotalSupply).to.equal(0.0025);
    expect(fndzDaoSharesBalance / vaultSharesTotalSupply).to.equal(0.0025);
  });
});

describe('Management Fee Suite (Vault Denomination Asset != FNDZ DAO Desired Currency)', function () {
  let firstVaultDepositAmount;
  let vaultDenominationAsset;
  let fndzDesiredToken;
  beforeEach(async function () {
    firstVaultDepositAmount = ethers.utils.parseEther('500'); // 500 BUSD in wei
    vaultDenominationAsset = mockBUSD;

    // Changing the fndzDao address to MockDai (!=denominationAsset)
    const fndzDaoAccount = accounts[9];
    await fndzController.connect(fndzDaoAccount).updateFndzDaoDesiredToken(mockDai.address);
    expect(await fndzController.fndzDaoDesiredToken()).to.equal(mockDai.address);
    fndzDesiredToken = mockDai;

    // Create Vault
    const onePercentScaledPerSecondRate = convertRateToScaledPerSecondRate(utils.parseEther('0.01'));
    const abiCoder = new ethers.utils.AbiCoder();
    const encodedFeeParams = abiCoder.encode(['uint'], [onePercentScaledPerSecondRate]);
    const encodedFeeData = abiCoder.encode(
      ['address[]', 'bytes[]'],
      [[contractAddresses.ManagementFee], [encodedFeeParams]],
    );

    const newFundTx = await fndzController.createNewFund(
      deployer.address,
      'Management Fee Test',
      vaultDenominationAsset.address,
      '1',
      encodedFeeData,
      emptyConfigData,
    );
    const newFundReceipt = await newFundTx.wait();

    const { comptrollerProxy, vaultProxy } = getFundAddresses(newFundReceipt);

    const ComptrollerLib = await ethers.getContractFactory('ComptrollerLib', deployer);
    comptroller = ComptrollerLib.attach(comptrollerProxy);
    expect(comptroller).to.be.an('object');

    const VaultLib = await ethers.getContractFactory('VaultLib', deployer);
    vault = VaultLib.attach(vaultProxy);
    expect(vault).to.be.an('object');

    // BUSD to DAI Pair
    const UniswapPair1 = await ethers.getContractFactory('MockUniswapV2Pair', deployer);
    const uniswapPair1 = await UniswapPair1.deploy(
      mockBUSD.address,
      mockDai.address,
      utils.parseEther('1000'),
      utils.parseEther('1000'),
      BigNumber.from('1000'),
    );
    await uniswapPair1.deployed();
    // DAI to BUSD Pair
    const UniswapPair2 = await ethers.getContractFactory('MockUniswapV2Pair', deployer);
    const uniswapPair2 = await UniswapPair2.deploy(
      mockDai.address,
      mockBUSD.address,
      utils.parseEther('1000'),
      utils.parseEther('1000'),
      BigNumber.from('1000'),
    );
    await uniswapPair2.deployed();

    const MockUniswapV2Factory = await hre.ethers.getContractFactory('MockUniswapV2Factory', deployer);
    const mockUniswapV2Factory = MockUniswapV2Factory.attach(contractAddresses.MockUniswapV2Factory);

    // Registering the MockUniswap Pairs
    await mockUniswapV2Factory.registerPair(mockBUSD.address, mockDai.address, uniswapPair1.address);
    await mockUniswapV2Factory.registerPair(mockDai.address, mockBUSD.address, uniswapPair2.address);

    // Initial Deposit
    await vaultDenominationAsset.connect(investor1).approve(comptroller.address, firstVaultDepositAmount);
    const buySharesTx = await comptroller
      .connect(investor1)
      .buyShares(firstVaultDepositAmount, 0, ethers.constants.AddressZero);
    const buySharesReceipt = await buySharesTx.wait();

    const settledEvents = filterEventsByABI(buySharesReceipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(0);
  });

  it('Triggers management fee of 1% when invoking continuous hook after one year', async function () {
    const previousVaultSharesTotalSupply = await vault.totalSupply();
    await advanceTime(timeIncrement); // 1 year since vault creation
    const tx = await fundActionsWrapper.invokeContinuousFeeHookAndPayoutSharesOutstandingForFund(comptroller.address, [
      managementFee.address,
    ]);
    const receipt = await tx.wait();

    // ManagementFee Settled event
    const settledEvents = filterEventsByABI(receipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(1);
    const {
      args: { comptrollerProxy, sharesQuantity, secondsSinceSettlement },
    } = settledEvents[0];
    expect(comptrollerProxy).to.equal(comptroller.address);

    // Check that total number of shares (including virtual) matches what is expected
    const expectedTotalSharesDue = managementFeeSharesDue(
      convertRateToScaledPerSecondRate(utils.parseEther('0.01')),
      previousVaultSharesTotalSupply,
      secondsSinceSettlement,
    );
    expect(expectedTotalSharesDue.sub(sharesQuantity).toNumber()).to.be.lessThan(10); // to handle rounding error
    expect(secondsSinceSettlement).to.equal(BigNumber.from(timeIncrement));

    // ComptrollerLib SharesRedeemed event
    const sharesRedeemedEvents = filterEventsByABI(receipt, [sharesRedeemedABI]);
    expect(sharesRedeemedEvents.length).to.equal(2);

    // VaultLib (and token) Transfer events
    const transferEvents = filterEventsByABI(receipt, [transferABI]);
    // transfer event of vault owner shares being minted - 1
    // transfer event of virtual shares being redeemed and paid to staking - 1
    // transfer event of denomination send to uniswap router while redeem and swap (mockedUniswap) - 1
    // transfer event of minting desired asset of fndzDao while redeem and swap (mockedUniswap) - 1
    expect(transferEvents.length).to.equal(4);
    // Transfer events of the denomination asset transferred to staking
    const denominationAssetTransferEventsToStaking = transferEvents.filter(
      (event) => event.args.from === vault.address && event.args.to == fndzStakingPool,
    );
    expect(denominationAssetTransferEventsToStaking.length).to.equal(1);
    // Transfer events of the denomination asset transferred to fndzDao (minted from uniswap mock)
    const desiredTokenTransferEventsToFndzDao = transferEvents.filter(
      (event) => event.args.from === ethers.constants.AddressZero && event.args.to == fndzDao,
    );
    expect(desiredTokenTransferEventsToFndzDao.length).to.equal(1);
    // Transfer event of vault owner shares being minted
    const ownerShareTransferEvents = transferEvents.filter(
      (event) => event.args.from === ethers.constants.AddressZero && event.args.to === vaultOwner.address,
    );
    expect(ownerShareTransferEvents.length).to.equal(1);
    const sharesMintedToVaultOwner = ownerShareTransferEvents[0].args.value;

    // Total number of virtual shares
    const totalVirtualSharesRedeemed = sharesRedeemedEvents.reduce((total, currentEvent) => {
      if (currentEvent.args.isVirtual) {
        total = total.add(currentEvent.args.sharesQuantity);
      }
      return total;
    }, BigNumber.from('0'));

    // Check that owner shares + virtual shares == total number of shares created
    expect(sharesQuantity).to.equal(sharesMintedToVaultOwner.add(totalVirtualSharesRedeemed));

    const stakingPoolReceivedAssetBalance = denominationAssetTransferEventsToStaking[0].args.value;
    const fndzDaoPoolReceivedAssetBalance = desiredTokenTransferEventsToFndzDao[0].args.value;

    const vaultSharesTotalSupply = await vault.totalSupply();
    const vaultOwnerShareBalance = await vault.balanceOf(vaultOwner.address);
    const vaultDenominationAssetBalance = await vaultDenominationAsset.balanceOf(vault.address);
    const stakingPoolDenominationAssetBalance = await vaultDenominationAsset.balanceOf(fndzStakingPool);
    const fndzDaoDesiredTokenBalance = await fndzDesiredToken.balanceOf(fndzDao);

    expect(stakingPoolDenominationAssetBalance).to.equal(stakingPoolReceivedAssetBalance);
    expect(fndzDaoDesiredTokenBalance).to.equal(fndzDaoPoolReceivedAssetBalance);
    expect(fndzDaoDesiredTokenBalance).to.equal(BigNumber.from('1186010000268879652'));

    expect(vaultOwnerShareBalance / vaultSharesTotalSupply).to.equal(0.005025125468797698);
    expect(stakingPoolDenominationAssetBalance / vaultDenominationAssetBalance).to.equal(0.002518875705893139);

    const fndzDaoDenominationAssetBalance = await vaultDenominationAsset.balanceOf(fndzDao);
    expect(fndzDaoDenominationAssetBalance).to.equal(0);
  });

  it('Triggers management fee of 1% when buying shares after one year', async function () {
    const previousVaultSharesTotalSupply = await vault.totalSupply();
    await vaultDenominationAsset.connect(investor2).approve(comptroller.address, ethers.utils.parseEther('200'));
    await advanceTime(timeIncrement); // 1 year since vault creation
    const tx = await comptroller
      .connect(investor2)
      .buyShares(ethers.utils.parseEther('200'), 0, ethers.constants.AddressZero);
    const receipt = await tx.wait();

    const { sharesReceived } = extractEventArgs(receipt, 'SharesBought');

    // ManagementFee Settled event
    const settledEvents = filterEventsByABI(receipt, [settledEventABI]);
    expect(settledEvents.length).to.equal(1);
    const {
      args: { comptrollerProxy, sharesQuantity, secondsSinceSettlement },
    } = settledEvents[0];
    expect(comptrollerProxy).to.equal(comptroller.address);

    // Check that total number of shares (including virtual) matches what is expected
    const expectedTotalSharesDue = managementFeeSharesDue(
      convertRateToScaledPerSecondRate(utils.parseEther('0.01')),
      previousVaultSharesTotalSupply.add(sharesReceived),
      secondsSinceSettlement,
    );
    expect(expectedTotalSharesDue.sub(sharesQuantity).toNumber()).to.be.lessThan(10); // to handle rounding error
    expect(secondsSinceSettlement.sub(timeIncrement).toNumber()).to.be.lessThan(2); // to adjust processing time

    // ComptrollerLib SharesRedeemed event
    const sharesRedeemedEvents = filterEventsByABI(receipt, [sharesRedeemedABI]);
    expect(sharesRedeemedEvents.length).to.equal(2);

    // VaultLib (and token) Transfer events
    const transferEvents = filterEventsByABI(receipt, [transferABI]);
    // transfer event of depositor shares being minter - 1
    // transfer event of deposited asset to vault - 1
    // transfer event of vault owner shares being minted - 1
    // transfer event of virtual shares being redeemed and paid to staking - 1
    // transfer event of denomination send to uniswap router while redeem and swap (mockedUniswap) - 1
    // transfer event of minting desired asset of fndzDao while redeem and swap (mockedUniswap) - 1
    expect(transferEvents.length).to.equal(6);
    // Transfer events of the denomination asset transferred to staking
    const denominationAssetTransferEventsToStaking = transferEvents.filter(
      (event) => event.args.from === vault.address && event.args.to == fndzStakingPool,
    );
    expect(denominationAssetTransferEventsToStaking.length).to.equal(1);
    // Transfer events of the denomination asset transferred to fndzDao (minted from uniswap mock)
    const desiredTokenTransferEventsToFndzDao = transferEvents.filter(
      (event) => event.args.from === ethers.constants.AddressZero && event.args.to == fndzDao,
    );
    expect(desiredTokenTransferEventsToFndzDao.length).to.equal(1);
    // Transfer event of vault owner shares being minted
    const ownerShareTransferEvents = transferEvents.filter(
      (event) => event.args.from === ethers.constants.AddressZero && event.args.to === vaultOwner.address,
    );
    expect(ownerShareTransferEvents.length).to.equal(1);
    const sharesMintedToVaultOwner = ownerShareTransferEvents[0].args.value;

    // Total number of virtual shares
    const totalVirtualSharesRedeemed = sharesRedeemedEvents.reduce((total, currentEvent) => {
      if (currentEvent.args.isVirtual) {
        total = total.add(currentEvent.args.sharesQuantity);
      }
      return total;
    }, BigNumber.from('0'));

    // Check that owner shares + virtual shares == total number of shares created
    expect(sharesQuantity).to.equal(sharesMintedToVaultOwner.add(totalVirtualSharesRedeemed));

    const stakingPoolReceivedAssetBalance = denominationAssetTransferEventsToStaking[0].args.value;
    const fndzDaoPoolReceivedAssetBalance = desiredTokenTransferEventsToFndzDao[0].args.value;

    const vaultSharesTotalSupply = await vault.totalSupply();
    const vaultOwnerShareBalance = await vault.balanceOf(vaultOwner.address);
    const vaultDenominationAssetBalance = await vaultDenominationAsset.balanceOf(vault.address);
    const stakingPoolDenominationAssetBalance = await vaultDenominationAsset.balanceOf(fndzStakingPool);
    const fndzDaoDesiredTokenBalance = await fndzDesiredToken.balanceOf(fndzDao);

    expect(stakingPoolDenominationAssetBalance).to.equal(stakingPoolReceivedAssetBalance);
    expect(fndzDaoDesiredTokenBalance).to.equal(fndzDaoPoolReceivedAssetBalance);
    expect(fndzDaoDesiredTokenBalance).to.equal(BigNumber.from('1659585301192127368'));

    expect(vaultOwnerShareBalance / vaultSharesTotalSupply).to.equal(0.005025125628140704);
    expect(stakingPoolDenominationAssetBalance / vaultDenominationAssetBalance).to.equal(0.002518875785965001);

    const fndzDaoDenominationAssetBalance = await vaultDenominationAsset.balanceOf(fndzDao);
    expect(fndzDaoDenominationAssetBalance).to.equal(0);
  });
});
