/* eslint-disable @typescript-eslint/no-var-requires */
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployments } = require('./utils/deploy-test-contracts.js');
const {
  emptyConfigData,
  filterEvents,
  extractEventArgs,
  bnArrayDeepEqual,
  getFundAddresses,
  filterEventsByABI,
  performanceFeeFundSettingsAddedEventABI,
} = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let accounts;
let deployer;
let fndzController;
let contractAddresses;

const managementFeeSettingsEvent =
  'event FundSettingsAdded(address indexed comptrollerProxy, uint256 scaledPerSecondRate)';
const mockManyParameterFeeSettingsEvent =
  'event FundSettingsAdded(address indexed comptrollerProxy, uint256 feeData1, uint256 feeData2, uint256 feeData3, uint256 feeData4, uint256 feeData5, uint256 feeData6, uint256 feeData7, uint256 feeData8, uint256 feeData9, uint256 feeData10)';
const inlineSwapRouterUpdatedEventABI = 'event InlineSwapRouterUpdated(address _oldRouter, address _newRouter)';
const inlineSwapFactoryUpdatedEventABI = 'event InlineSwapFactoryUpdated(address _oldFactory, address _newFactory)';
const fndzStakingPoolUpdatedEventABI = 'event FndzStakingPoolUpdated(address _oldPool, address _newPool)';
const fndzDaoUpdatedEventABI = 'event FndzDaoUpdated(address _oldDao, address _newDao)';
const fndzDaoDesiredTokenUpdatedEventABI = 'event FndzDaoDesiredTokenUpdated(address _oldToken, address _newToken)';
const inlineSwapAllowancesUpdatedEventABI =
  'event InlineSwapAllowancesUpdated(uint256 _oldDeadlineIncrement,uint256 _oldMinimumPercentageReceived,uint256 _newDeadlineIncrement,uint256 _newMinimumPercentageReceived)';
const paraSwapFeeUpdatedABI = 'event ParaSwapFeeUpdated(uint256 _fee)';

beforeEach(async function () {
  // runs before each test in this block
  contractAddresses = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contractAddresses.FNDZController);
  expect(fndzController).to.be.an('object');
});

describe('FNDZController Test Suite', function () {
  describe('Denomination Assets', async function () {
    it('Should not be able to add duplicate denomination assets', async function () {
      await expect(fndzController.addDenominationAssets([contractAddresses.mockTokens.MockBUSD])).to.be.revertedWith(
        ' asset already added',
      );
    });

    it('Should be able to add denomination assets', async function () {
      const assetList = [contractAddresses.mockTokens.MockDai, contractAddresses.mockTokens.MockUSDC];
      const tx = await fndzController.addDenominationAssets(assetList);
      const receipt = await tx.wait();
      const denominationAssetAddedEvents = filterEvents(receipt, 'DenominationAssetAdded');
      expect(denominationAssetAddedEvents.length).to.equal(2);
      expect(denominationAssetAddedEvents[0].args.asset).to.equal(assetList[0]);
      expect(denominationAssetAddedEvents[1].args.asset).to.equal(assetList[1]);
      expect(await fndzController.isDenominationAssetApproved(assetList[0])).to.be.true;
      expect(await fndzController.isDenominationAssetApproved(assetList[1])).to.be.true;
      expect(await fndzController.isDenominationAssetApproved(contractAddresses.mockTokens.MockBUSD)).to.be.true;
    });

    it('Should able to remove denomination assets', async function () {
      var assetList = [contractAddresses.mockTokens.MockDai, contractAddresses.mockTokens.MockUSDC];
      await fndzController.addDenominationAssets(assetList);
      const tx = await fndzController.removeDenominationAssets(assetList);
      const receipt = await tx.wait();
      const denominationAssetRemovedEvents = filterEvents(receipt, 'DenominationAssetRemoved');
      expect(denominationAssetRemovedEvents.length).to.equal(2);
      expect(denominationAssetRemovedEvents[0].args.asset).to.equal(assetList[0]);
      expect(denominationAssetRemovedEvents[1].args.asset).to.equal(assetList[1]);
      expect(await fndzController.isDenominationAssetApproved(assetList[0])).to.be.false;
      expect(await fndzController.isDenominationAssetApproved(assetList[1])).to.be.false;
      expect(await fndzController.isDenominationAssetApproved(contractAddresses.mockTokens.MockBUSD)).to.be.true;
    });

    it('Should not be able to remove denomination asset which is not approved', async function () {
      await expect(fndzController.removeDenominationAssets([contractAddresses.mockTokens.MockDai])).to.revertedWith(
        'removeDenominationAssets: cannot remove a denomination that has not been added',
      );
    });

    it('Should not be possible to add or remove denomination assets if the caller is not the owner', async function () {
      await expect(
        fndzController
          .connect(accounts[1])
          .addDenominationAssets([contractAddresses.mockTokens.MockDai, contractAddresses.mockTokens.MockUSDC]),
      ).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(
        fndzController.connect(accounts[1]).removeDenominationAssets([contractAddresses.mockTokens.MockBUSD]),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Should be able to verify the approved denomination asset', async function () {
      // Adding denomination assets to approved list
      await fndzController.addDenominationAssets([contractAddresses.mockTokens.MockDai]);
      expect(await fndzController.isDenominationAssetApproved(contractAddresses.mockTokens.MockDai)).to.be.true;
      expect(await fndzController.isDenominationAssetApproved(contractAddresses.mockTokens.MockUSDC)).to.be.false;
    });
  });

  describe('Fee Configurations', async function () {
    it('Should be possible to get and set a new fee configuration', async function () {
      const feeAddress = contractAddresses.EntranceReferralFee;
      // Removing from configured fee to test
      await fndzController.removeFeeConfiguration(feeAddress);

      // uninitialized fee
      const uninitializedFee = await fndzController.getFeeConfiguration(feeAddress);
      expect(uninitializedFee.valid).to.equal(false);
      expect(uninitializedFee.parameterMinValues.length).to.equal(0);
      expect(uninitializedFee.parameterMaxValues.length).to.equal(0);

      const minValues = [ethers.BigNumber.from('0')];
      const maxValues = [ethers.utils.parseEther('0.05')];
      const tx = await fndzController.setFeeConfiguration(feeAddress, minValues, maxValues);
      const receipt = await tx.wait();
      const { _feeAddress } = extractEventArgs(receipt, 'FeeConfigurationUpdated');

      expect(_feeAddress).to.equal(feeAddress);
      const newFee = await fndzController.getFeeConfiguration(feeAddress);

      expect(newFee.valid).to.equal(true);
      expect(bnArrayDeepEqual(newFee.parameterMinValues, minValues)).to.equal(true);
      expect(bnArrayDeepEqual(newFee.parameterMaxValues, maxValues)).to.equal(true);
    });

    it('Should be possible to get and set an existing fee configuration', async function () {
      const feeAddress = contractAddresses.PerformanceFee;

      // initialized fee
      const existingFee = await fndzController.getFeeConfiguration(feeAddress);
      expect(existingFee.valid).to.equal(true);
      expect(existingFee.parameterMinValues.length).to.equal(2);
      expect(existingFee.parameterMaxValues.length).to.equal(2);

      const minValues = [ethers.BigNumber.from('0'), ethers.BigNumber.from('86400')];
      const maxValues = [ethers.utils.parseEther('0.10'), ethers.BigNumber.from('31536000')];
      const tx = await fndzController.setFeeConfiguration(feeAddress, minValues, maxValues);
      const receipt = await tx.wait();
      const { _feeAddress } = extractEventArgs(receipt, 'FeeConfigurationUpdated');

      expect(_feeAddress).to.equal(feeAddress);
      const newFee = await fndzController.getFeeConfiguration(feeAddress);

      expect(newFee.valid).to.equal(true);
      expect(bnArrayDeepEqual(newFee.parameterMinValues, minValues)).to.equal(true);
      expect(bnArrayDeepEqual(newFee.parameterMaxValues, maxValues)).to.equal(true);
    });

    it('Should be possible to delete an existing fee configuration', async function () {
      const feeAddress = contractAddresses.PerformanceFee;

      // initialized fee
      const existingFee = await fndzController.getFeeConfiguration(feeAddress);
      expect(existingFee.valid).to.equal(true);
      expect(existingFee.parameterMinValues.length).to.equal(2);
      expect(existingFee.parameterMaxValues.length).to.equal(2);

      const tx = await fndzController.removeFeeConfiguration(feeAddress);
      const receipt = await tx.wait();
      const { _feeAddress } = extractEventArgs(receipt, 'FeeConfigurationRemoved');
      expect(_feeAddress).to.equal(feeAddress);

      // deleted fee
      const deletedFee = await fndzController.getFeeConfiguration(feeAddress);
      expect(deletedFee.valid).to.equal(false);
      expect(deletedFee.parameterMinValues.length).to.equal(0);
      expect(deletedFee.parameterMaxValues.length).to.equal(0);
    });

    it('Should be possible to set a fee configuration with zero parameters', async function () {
      const feeAddress = contractAddresses.EntranceReferralFee;

      const minValues = [];
      const maxValues = [];
      const tx = await fndzController.setFeeConfiguration(feeAddress, minValues, maxValues);
      const receipt = await tx.wait();
      const { _feeAddress } = extractEventArgs(receipt, 'FeeConfigurationUpdated');

      expect(_feeAddress).to.equal(feeAddress);
      const newFee = await fndzController.getFeeConfiguration(feeAddress);

      expect(newFee.valid).to.equal(true);
      expect(newFee.parameterMinValues.length).to.equal(0);
      expect(newFee.parameterMaxValues.length).to.equal(0);
    });

    it('Should not be possible to delete an uninitialized fee configuration', async function () {
      const feeAddress = contractAddresses.EntranceReferralFee;
      // Removing from configured fee to test
      await fndzController.removeFeeConfiguration(feeAddress);

      // initialized fee
      const uninitializedFee = await fndzController.getFeeConfiguration(feeAddress);
      expect(uninitializedFee.valid).to.equal(false);
      expect(uninitializedFee.parameterMinValues.length).to.equal(0);
      expect(uninitializedFee.parameterMaxValues.length).to.equal(0);

      await expect(fndzController.removeFeeConfiguration(feeAddress)).to.be.revertedWith(
        'removeFeeConfiguration: fee configuration is not set',
      );
    });

    it('Should not be possible to set a fee configuration with mismatched array lengths', async function () {
      const feeAddress = contractAddresses.EntranceReferralFee;
      const minValues = [];
      const maxValues = [ethers.utils.parseEther('0.05')];
      await expect(fndzController.setFeeConfiguration(feeAddress, minValues, maxValues)).to.be.revertedWith(
        'setFeeConfiguration: _parameterMinValues and _parameterMaxValues lengths must be equal',
      );
    });

    it('Should be able to set a fee configuration with many parameters', async function () {
      const feeAddress = contractAddresses.MockManyParameterFee;

      const minValues = [
        ethers.BigNumber.from('0'),
        ethers.BigNumber.from('0'),
        ethers.BigNumber.from('0'),
        ethers.BigNumber.from('0'),
        ethers.BigNumber.from('0'),
        ethers.BigNumber.from('0'),
        ethers.BigNumber.from('0'),
        ethers.BigNumber.from('0'),
        ethers.BigNumber.from('0'),
        ethers.BigNumber.from('0'),
      ];
      const maxValues = [
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.05'),
        ethers.utils.parseEther('0.05'),
      ];

      const tx = await fndzController.setFeeConfiguration(feeAddress, minValues, maxValues);
      const receipt = await tx.wait();
      const { _feeAddress } = extractEventArgs(receipt, 'FeeConfigurationUpdated');

      expect(_feeAddress).to.equal(feeAddress);
      const newFee = await fndzController.getFeeConfiguration(feeAddress);

      expect(newFee.valid).to.equal(true);
      expect(bnArrayDeepEqual(newFee.parameterMinValues, minValues)).to.equal(true);
      expect(bnArrayDeepEqual(newFee.parameterMaxValues, maxValues)).to.equal(true);
    });

    it('Should not be possible to set or delete a fee configuration if the caller is not the owner', async function () {
      const existingFeeAddress = contractAddresses.PerformanceFee;

      // initialized fee
      const existingFee = await fndzController.getFeeConfiguration(existingFeeAddress);
      expect(existingFee.valid).to.equal(true);
      expect(existingFee.parameterMinValues.length).to.equal(2);
      expect(existingFee.parameterMaxValues.length).to.equal(2);

      const minValues = [ethers.BigNumber.from('0'), ethers.BigNumber.from('86400')];
      const maxValues = [ethers.utils.parseEther('0.10'), ethers.BigNumber.from('31536000')];
      await expect(
        fndzController.connect(accounts[1]).setFeeConfiguration(existingFeeAddress, minValues, maxValues),
      ).to.be.revertedWith('Ownable: caller is not the owner');

      await expect(fndzController.connect(accounts[1]).removeFeeConfiguration(existingFeeAddress)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );

      const newMinValues = [ethers.BigNumber.from('0')];
      const newMaxValues = [ethers.utils.parseEther('0.05')];
      await expect(
        fndzController
          .connect(accounts[1])
          .setFeeConfiguration(contractAddresses.EntranceReferralFee, newMinValues, newMaxValues),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('Creating new vaults', async function () {
    let fundDeployer;
    const testVaultName = 'Test';
    beforeEach(async function () {
      const FundDeployer = await ethers.getContractFactory('FundDeployer', deployer);
      fundDeployer = await FundDeployer.attach(contractAddresses.FundDeployer);
      expect(fundDeployer).to.be.an('object');
    });
    describe('Fund Deployer Requirements', async function () {
      it('does not allow an empty _fundOwner', async () => {
        await expect(
          fndzController.createNewFund(
            ethers.constants.AddressZero,
            testVaultName,
            contractAddresses.mockTokens.MockBUSD,
            0,
            emptyConfigData,
            emptyConfigData,
          ),
        ).to.be.revertedWith('__createNewFund: _owner cannot be empty');
      });

      it('does not allow an empty _denominationAsset', async () => {
        await fndzController.addDenominationAssets([ethers.constants.AddressZero]);
        await expect(
          fndzController.createNewFund(
            deployer.address,
            testVaultName,
            ethers.constants.AddressZero,
            0,
            emptyConfigData,
            emptyConfigData,
          ),
        ).to.be.revertedWith('__deployComptrollerProxy: _denominationAsset cannot be empty');
      });

      it('does not allow the release status to be Paused', async () => {
        await fundDeployer.setReleaseStatus('2');
        await expect(
          fndzController.createNewFund(
            deployer.address,
            testVaultName,
            contractAddresses.mockTokens.MockBUSD,
            0,
            emptyConfigData,
            emptyConfigData,
          ),
        ).to.be.revertedWith('Release is not Live');
      });
    });

    describe('FNDZ Controller Requirements', async function () {
      it('does not allow an unapproved denomination asset', async () => {
        await fndzController.addDenominationAssets([ethers.constants.AddressZero]);
        await expect(
          fndzController.createNewFund(
            deployer.address,
            testVaultName,
            contractAddresses.mockTokens.MockUSDC,
            0,
            emptyConfigData,
            emptyConfigData,
          ),
        ).to.be.revertedWith('createNewFund: denomination asset is not approved');
      });

      it('Should not allow to create fund if fundDeployer is not set', async function () {
        // set fund deployer as zero address
        await fndzController.updateFundDeployerAddress(ethers.constants.AddressZero);
        await expect(
          fndzController.createNewFund(
            deployer.address,
            testVaultName,
            contractAddresses.mockTokens.MockBUSD,
            0,
            emptyConfigData,
            emptyConfigData,
          ),
        ).to.be.revertedWith('createNewFund: Fund Deployer not set');
      });

      it('Should create a new Fund', async () => {
        const tx = await fndzController.createNewFund(
          deployer.address,
          testVaultName,
          contractAddresses.mockTokens.MockBUSD,
          0,
          emptyConfigData,
          emptyConfigData,
        );
        const receipt = await tx.wait();
        expect(receipt.status).to.equal(1);
      });

      it('Should not allow a fund to be created with an unregistered fee', async () => {
        const feeAddress = contractAddresses.EntranceReferralFee;
        // Removing from configured fee to test
        await fndzController.removeFeeConfiguration(feeAddress);

        const abiCoder = new ethers.utils.AbiCoder();
        const encodedFeeParams = abiCoder.encode(['uint'], [ethers.utils.parseEther('0.01')]);
        const encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[feeAddress], [encodedFeeParams]]);
        await expect(
          fndzController.createNewFund(
            deployer.address,
            testVaultName,
            contractAddresses.mockTokens.MockBUSD,
            0,
            encodedFeeData,
            emptyConfigData,
          ),
        ).to.be.revertedWith('createNewFund: Unknown fee');
      });

      it('Should not allow a fund to be created with a fee parameter value greater than the maximum', async () => {
        const feeAddress = contractAddresses.ManagementFee;
        const feeConfiguration = await fndzController.getFeeConfiguration(feeAddress);
        expect(feeConfiguration.valid).to.equal(true);
        expect(feeConfiguration.parameterMaxValues.length).to.equal(1);
        const largerFee = feeConfiguration.parameterMaxValues[0].add(1);

        const abiCoder = new ethers.utils.AbiCoder();
        const encodedFeeParams = abiCoder.encode(['uint'], [largerFee]);
        const encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[feeAddress], [encodedFeeParams]]);
        await expect(
          fndzController.createNewFund(
            deployer.address,
            testVaultName,
            contractAddresses.mockTokens.MockBUSD,
            0,
            encodedFeeData,
            emptyConfigData,
          ),
        ).to.be.revertedWith('createNewFund: fee parameter value is not within the acceptable range');
      });

      it('Should not allow a fund to be created with a fee parameter value smaller than the minimum', async () => {
        const feeAddress = contractAddresses.PerformanceFee;
        const feeConfiguration = await fndzController.getFeeConfiguration(feeAddress);
        expect(feeConfiguration.valid).to.equal(true);
        expect(feeConfiguration.parameterMinValues.length).to.equal(2);

        // pick a shorter than allowed crystallization period
        const shorterCrystallizationPeriod = feeConfiguration.parameterMinValues[1].sub(1);

        const abiCoder = new ethers.utils.AbiCoder();
        const encodedFeeParams = abiCoder.encode(
          ['uint', 'uint'],
          [feeConfiguration.parameterMaxValues[0], shorterCrystallizationPeriod],
        );
        const encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[feeAddress], [encodedFeeParams]]);
        await expect(
          fndzController.createNewFund(
            deployer.address,
            testVaultName,
            contractAddresses.mockTokens.MockBUSD,
            0,
            encodedFeeData,
            emptyConfigData,
          ),
        ).to.be.revertedWith('createNewFund: fee parameter value is not within the acceptable range');
      });

      it('Should allow a fund to be created with fee parameter values equal to the minimum and maximum', async () => {
        const feeAddress = contractAddresses.PerformanceFee;
        const feeConfiguration = await fndzController.getFeeConfiguration(feeAddress);
        expect(feeConfiguration.valid).to.equal(true);
        expect(feeConfiguration.parameterMinValues.length).to.equal(2);
        expect(feeConfiguration.parameterMaxValues.length).to.equal(2);
        const maxFeeRate = feeConfiguration.parameterMaxValues[0];
        const minCrystallizationPeriod = feeConfiguration.parameterMinValues[1];

        const abiCoder = new ethers.utils.AbiCoder();
        const encodedFeeParams = abiCoder.encode(['uint', 'uint'], [maxFeeRate, minCrystallizationPeriod]);
        const encodedFeeData = abiCoder.encode(['address[]', 'bytes[]'], [[feeAddress], [encodedFeeParams]]);
        const tx = await fndzController.createNewFund(
          deployer.address,
          testVaultName,
          contractAddresses.mockTokens.MockBUSD,
          0,
          encodedFeeData,
          emptyConfigData,
        );
        const receipt = await tx.wait();
        expect(receipt.status).to.equal(1);

        const { comptrollerProxy } = getFundAddresses(receipt);
        const feeEvents = filterEventsByABI(receipt, [performanceFeeFundSettingsAddedEventABI]);
        expect(feeEvents[0].args.comptrollerProxy).to.equal(comptrollerProxy);
        expect(feeEvents[0].args.rate).to.equal(maxFeeRate);
        expect(feeEvents[0].args.period).to.equal(minCrystallizationPeriod);
      });

      it('Should allow a fund to be created with zero fee parameters', async () => {
        const FixedRateManagementFee = await ethers.getContractFactory('MockFixedRateManagementFee', deployer);
        const fixedRateManagementFee = await FixedRateManagementFee.deploy(contractAddresses.FeeManager);
        await fixedRateManagementFee.deployed();

        const FeeManager = await ethers.getContractFactory('FeeManager', deployer);
        const feeManager = FeeManager.attach(contractAddresses.FeeManager);
        await feeManager.registerFees([fixedRateManagementFee.address]);

        await fndzController.setFeeConfiguration(fixedRateManagementFee.address, [], []);

        const abiCoder = new ethers.utils.AbiCoder();
        const encodedFeeParams = abiCoder.encode([], []);
        const encodedFeeData = abiCoder.encode(
          ['address[]', 'bytes[]'],
          [[fixedRateManagementFee.address], [encodedFeeParams]],
        );
        const tx = await fndzController.createNewFund(
          deployer.address,
          testVaultName,
          contractAddresses.mockTokens.MockBUSD,
          0,
          encodedFeeData,
          emptyConfigData,
        );
        const receipt = await tx.wait();
        expect(receipt.status).to.equal(1);

        const { comptrollerProxy } = getFundAddresses(receipt);
        const feeEvents = filterEventsByABI(receipt, [managementFeeSettingsEvent]);
        expect(feeEvents[0].args.comptrollerProxy).to.equal(comptrollerProxy);
        expect(feeEvents[0].args.scaledPerSecondRate).to.equal(ethers.BigNumber.from('1000000000318694059332284760'));
      });

      it('Should allow a fund to be created with multiple fees that have different parameter lengths', async () => {
        // fee 1

        const FixedRateManagementFee = await ethers.getContractFactory('MockFixedRateManagementFee', deployer);
        const fixedRateManagementFee = await FixedRateManagementFee.deploy(contractAddresses.FeeManager);
        await fixedRateManagementFee.deployed();

        const FeeManager = await ethers.getContractFactory('FeeManager', deployer);
        const feeManager = FeeManager.attach(contractAddresses.FeeManager);
        await feeManager.registerFees([fixedRateManagementFee.address]);

        await fndzController.setFeeConfiguration(fixedRateManagementFee.address, [], []);

        const abiCoder = new ethers.utils.AbiCoder();
        const encodedFeeParamsFRMF = abiCoder.encode([], []);

        // fee 2

        const performanceFeeAddress = contractAddresses.PerformanceFee;
        let feeConfiguration = await fndzController.getFeeConfiguration(performanceFeeAddress);
        expect(feeConfiguration.valid).to.equal(true);
        expect(feeConfiguration.parameterMinValues.length).to.equal(2);
        expect(feeConfiguration.parameterMaxValues.length).to.equal(2);
        const maxFeeRate = feeConfiguration.parameterMaxValues[0];
        const minCrystallizationPeriod = feeConfiguration.parameterMinValues[1];

        const encodedFeeParamsPF = abiCoder.encode(['uint', 'uint'], [maxFeeRate, minCrystallizationPeriod]);

        //fee 3

        const mockManyParameterFeeAddress = contractAddresses.MockManyParameterFee;
        await feeManager.registerFees([mockManyParameterFeeAddress]);
        await fndzController.setFeeConfiguration(
          mockManyParameterFeeAddress,
          [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          [9, 9, 9, 9, 9, 9, 9, 9, 9, 9],
        );
        const encodedFeeParamsMPF = abiCoder.encode(
          [
            'uint256',
            'uint256',
            'uint256',
            'uint256',
            'uint256',
            'uint256',
            'uint256',
            'uint256',
            'uint256',
            'uint256',
          ],
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 9],
        );

        // encode both fees and deploy fund
        const encodedFeeData = abiCoder.encode(
          ['address[]', 'bytes[]'],
          [
            [fixedRateManagementFee.address, performanceFeeAddress, mockManyParameterFeeAddress],
            [encodedFeeParamsFRMF, encodedFeeParamsPF, encodedFeeParamsMPF],
          ],
        );
        const tx = await fndzController.createNewFund(
          deployer.address,
          'testVaultName',
          contractAddresses.mockTokens.MockBUSD,
          0,
          encodedFeeData,
          emptyConfigData,
        );
        const receipt = await tx.wait();
        expect(receipt.status).to.equal(1);

        // Confirm both fees were set correctly

        const { comptrollerProxy } = getFundAddresses(receipt);
        const managementFeeEvents = filterEventsByABI(receipt, [managementFeeSettingsEvent]);
        expect(managementFeeEvents[0].args.comptrollerProxy).to.equal(comptrollerProxy);
        expect(managementFeeEvents[0].args.scaledPerSecondRate).to.equal(
          ethers.BigNumber.from('1000000000318694059332284760'),
        );

        const performanceFeeEvents = filterEventsByABI(receipt, [performanceFeeFundSettingsAddedEventABI]);
        expect(performanceFeeEvents[0].args.comptrollerProxy).to.equal(comptrollerProxy);
        expect(performanceFeeEvents[0].args.rate).to.equal(maxFeeRate);
        expect(performanceFeeEvents[0].args.period).to.equal(minCrystallizationPeriod);

        const mockManyParameterFeeEvents = filterEventsByABI(receipt, [mockManyParameterFeeSettingsEvent]);
        expect(mockManyParameterFeeEvents[0].args.comptrollerProxy).to.equal(comptrollerProxy);
        expect(mockManyParameterFeeEvents[0].args.feeData1).to.equal(1);
        expect(mockManyParameterFeeEvents[0].args.feeData2).to.equal(2);
        expect(mockManyParameterFeeEvents[0].args.feeData3).to.equal(3);
        expect(mockManyParameterFeeEvents[0].args.feeData4).to.equal(4);
        expect(mockManyParameterFeeEvents[0].args.feeData5).to.equal(5);
        expect(mockManyParameterFeeEvents[0].args.feeData6).to.equal(6);
        expect(mockManyParameterFeeEvents[0].args.feeData7).to.equal(7);
        expect(mockManyParameterFeeEvents[0].args.feeData8).to.equal(8);
        expect(mockManyParameterFeeEvents[0].args.feeData9).to.equal(9);
        expect(mockManyParameterFeeEvents[0].args.feeData10).to.equal(9);
        feeConfiguration = await fndzController.getFeeConfiguration(mockManyParameterFeeAddress);
        expect(feeConfiguration.valid).to.equal(true);
        expect(feeConfiguration.parameterMinValues.length).to.equal(10);
        expect(feeConfiguration.parameterMaxValues.length).to.equal(10);
      });
      it('Should update updatePerformanceFeeSplit and updateManagementFeeSplit based on the condition', async () => {
        //updateManagementFeeSplit
        const vaultOwnerSplit = BigNumber.from('100000000000000');
        let stakingAndDaoSplit = BigNumber.from('499960000000000000');
        await expect(fndzController.updateManagementFeeSplit(vaultOwnerSplit, stakingAndDaoSplit)).to.be.revertedWith(
          'updateManagementFeeSplit: _vaultOwnerSplit + (_stakingAndDaoSplit * 2) must equal RATE_DIVISOR',
        );
        stakingAndDaoSplit = BigNumber.from('499950000000000000');
        let txn = await fndzController.updateManagementFeeSplit(vaultOwnerSplit, stakingAndDaoSplit);
        let receipt = await txn.wait();
        expect(receipt.status).to.equal(1);

        //updatePerformanceFeeSplit
        const high_value = BigNumber.from('10000000000000000000');
        const low_value = BigNumber.from('499960000000000000');
        await expect(
          fndzController.updatePerformanceFeeSplit(high_value, low_value, 0, 0, low_value),
        ).to.be.revertedWith(
          'updatePerformanceFeeSplit: _vaultOwnerSplitBase should be less than or equal to RATE_DIVISOR',
        );
        await expect(
          fndzController.updatePerformanceFeeSplit(low_value, high_value, 0, 0, low_value),
        ).to.be.revertedWith(
          'updatePerformanceFeeSplit: _vaultOwnerSplitMax should be less than or equal to RATE_DIVISOR',
        );
        await expect(
          fndzController.updatePerformanceFeeSplit(low_value, low_value, 0, 0, high_value),
        ).to.be.revertedWith(
          'updatePerformanceFeeSplit: _vaultOwnerSplitIncreasePerTier should be less than or equal to RATE_DIVISOR',
        );
        txn = await fndzController.updatePerformanceFeeSplit(low_value, low_value, 0, 0, low_value);
        receipt = await txn.wait();
        expect(receipt.status).to.equal(1);
      });
    });
  });

  describe('Updating state variables', async function () {
    it('Should be able to update inline swap router', async function () {
      const oldUniswapV2Router02 = await await fndzController.getInlineSwapRouterAddress();
      const uniswapV2Router02 = ethers.Wallet.createRandom().address;
      const updateTx = await fndzController.updateInlineSwapRouterAddress(uniswapV2Router02);
      const updateReceipt = await updateTx.wait();
      const updateEvents = filterEventsByABI(updateReceipt, [inlineSwapRouterUpdatedEventABI]);
      expect(updateEvents.length).to.equal(1);
      const updateEvent = updateEvents[0].args;
      expect(updateEvent._oldRouter).to.equal(oldUniswapV2Router02);
      expect(updateEvent._newRouter).to.equal(uniswapV2Router02);
      expect(await fndzController.getInlineSwapRouterAddress()).to.equal(uniswapV2Router02);

      // Should not accept zero address
      await expect(fndzController.updateInlineSwapRouterAddress(ethers.constants.AddressZero)).to.revertedWith(
        'Address should not be zero address',
      );
      // Only owner can call
      await expect(
        fndzController.connect(accounts[1]).updateInlineSwapRouterAddress(ethers.constants.AddressZero),
      ).to.revertedWith('Ownable: caller is not the owner');
    });
    it('Should be able to update inline swap factory address', async function () {
      const oldUniswapV2Factory = await fndzController.uniswapV2Factory();
      const uniswapV2Factory = ethers.Wallet.createRandom().address;
      const updateTx = await fndzController.updateInlineSwapFactoryAddress(uniswapV2Factory);
      const updateReceipt = await updateTx.wait();
      const updateEvents = filterEventsByABI(updateReceipt, [inlineSwapFactoryUpdatedEventABI]);
      expect(updateEvents.length).to.equal(1);
      const updateEvent = updateEvents[0].args;
      expect(updateEvent._oldFactory).to.equal(oldUniswapV2Factory);
      expect(updateEvent._newFactory).to.equal(uniswapV2Factory);
      expect(await fndzController.uniswapV2Factory()).to.equal(uniswapV2Factory);

      // Should not accept zero address
      await expect(fndzController.updateInlineSwapFactoryAddress(ethers.constants.AddressZero)).to.revertedWith(
        'Address should not be zero address',
      );
      // Only owner can call
      await expect(
        fndzController.connect(accounts[1]).updateInlineSwapFactoryAddress(ethers.constants.AddressZero),
      ).to.revertedWith('Ownable: caller is not the owner');
    });
    it('Should be able to update fndzStakingPool address', async function () {
      const oldFndzStakingPool = await fndzController.fndzStakingPool();
      const fndzStakingPool = ethers.Wallet.createRandom().address;
      const updateTx = await fndzController.updateFndzStakingPoolAddress(fndzStakingPool);
      const updateReceipt = await updateTx.wait();
      const updateEvents = filterEventsByABI(updateReceipt, [fndzStakingPoolUpdatedEventABI]);
      expect(updateEvents.length).to.equal(1);
      const updateEvent = updateEvents[0].args;
      expect(updateEvent._oldPool).to.equal(oldFndzStakingPool);
      expect(updateEvent._newPool).to.equal(fndzStakingPool);
      expect(await fndzController.fndzStakingPool()).to.equal(fndzStakingPool);

      // Should not accept zero address
      await expect(fndzController.updateFndzStakingPoolAddress(ethers.constants.AddressZero)).to.revertedWith(
        'Address should not be zero address',
      );
      // Only owner can call
      await expect(
        fndzController.connect(accounts[1]).updateFndzStakingPoolAddress(ethers.constants.AddressZero),
      ).to.revertedWith('Ownable: caller is not the owner');
    });
    it('Should be able to update fndzDao address', async function () {
      const oldFndzDao = await fndzController.fndzDao();
      const fndzDao = ethers.Wallet.createRandom().address;
      const updateTx = await fndzController.updateFndzDaoAddress(fndzDao);
      const updateReceipt = await updateTx.wait();
      const updateEvents = filterEventsByABI(updateReceipt, [fndzDaoUpdatedEventABI]);
      expect(updateEvents.length).to.equal(1);
      const updateEvent = updateEvents[0].args;
      expect(updateEvent._oldDao).to.equal(oldFndzDao);
      expect(updateEvent._newDao).to.equal(fndzDao);
      expect(await fndzController.fndzDao()).to.equal(fndzDao);

      // Should not accept zero address
      await expect(fndzController.updateFndzDaoAddress(ethers.constants.AddressZero)).to.revertedWith(
        'Address should not be zero address',
      );
      // Only owner can call
      await expect(
        fndzController.connect(accounts[1]).updateFndzDaoAddress(ethers.constants.AddressZero),
      ).to.revertedWith('Ownable: caller is not the owner');
    });
    it('Should be able to update fndzDaoDesiredToken address', async function () {
      const oldFndzDaoDesiredToken = await fndzController.fndzDaoDesiredToken();
      const fndzDao = accounts[9];
      const fndzDaoDesiredToken = ethers.Wallet.createRandom().address;
      const updateTx = await fndzController.connect(fndzDao).updateFndzDaoDesiredToken(fndzDaoDesiredToken);
      const updateReceipt = await updateTx.wait();
      const updateEvents = filterEventsByABI(updateReceipt, [fndzDaoDesiredTokenUpdatedEventABI]);
      expect(updateEvents.length).to.equal(1);
      const updateEvent = updateEvents[0].args;
      expect(updateEvent._oldToken).to.equal(oldFndzDaoDesiredToken);
      expect(updateEvent._newToken).to.equal(fndzDaoDesiredToken);
      expect(await fndzController.fndzDaoDesiredToken()).to.equal(fndzDaoDesiredToken);

      // Should not accept zero address
      await expect(
        fndzController.connect(fndzDao).updateFndzDaoDesiredToken(ethers.constants.AddressZero),
      ).to.revertedWith('Address should not be zero address');
      // Only fndz Dao can call
      await expect(fndzController.connect(accounts[1]).updateFndzDaoDesiredToken(accounts[1].address)).to.revertedWith(
        'updateFndzDaoDesiredToken: function may only be called by the FNDZ DAO',
      );
    });
    it('Should be able to update inline swap allowances', async function () {
      const oldInlineSwapData = await fndzController.getFeeInlineSwapData();
      const swapDeadLineIncrement = 120;
      const swapMinPercentageReceived = utils.parseEther('0.98');
      const updateTx = await fndzController.updateInlineSwapAllowances(
        swapDeadLineIncrement,
        swapMinPercentageReceived,
      );
      const updateReceipt = await updateTx.wait();
      const updateEvents = filterEventsByABI(updateReceipt, [inlineSwapAllowancesUpdatedEventABI]);
      expect(updateEvents.length).to.equal(1);
      const updateEvent = updateEvents[0].args;
      expect(updateEvent._oldDeadlineIncrement).to.equal(oldInlineSwapData[2]);
      expect(updateEvent._oldMinimumPercentageReceived).to.equal(oldInlineSwapData[3]);
      expect(updateEvent._newDeadlineIncrement).to.equal(swapDeadLineIncrement);
      expect(updateEvent._newMinimumPercentageReceived).to.equal(swapMinPercentageReceived);
      const inlineSwapData = await fndzController.getFeeInlineSwapData();
      expect(inlineSwapData[2]).to.equal(swapDeadLineIncrement);
      expect(inlineSwapData[3]).to.equal(swapMinPercentageReceived);

      // swap minimum percentage received should not be greater than rate divisor
      await expect(
        fndzController.updateInlineSwapAllowances(swapDeadLineIncrement, utils.parseEther('1').add(1)),
      ).to.revertedWith('_swapMinimumPercentageReceived is greater than RATE_DIVISOR');
      // Only owner can call
      await expect(
        fndzController
          .connect(accounts[1])
          .updateInlineSwapAllowances(swapDeadLineIncrement, swapMinPercentageReceived),
      ).to.revertedWith('Ownable: caller is not the owner');
    });
    it('Should be able to update paraSwapFee', async function () {
      const newParaSwapFee = 100;
      const updateTx = await fndzController.updateParaSwapFee(newParaSwapFee);
      const updateReceipt = await updateTx.wait();
      const updateEvents = filterEventsByABI(updateReceipt, [paraSwapFeeUpdatedABI]);
      expect(updateEvents.length).to.equal(1);
      const updateEvent = updateEvents[0].args;
      expect(updateEvent._fee).to.equal(newParaSwapFee);
      expect(await fndzController.getParaSwapFee()).to.equal(newParaSwapFee);

      // Only owner can call
      await expect(fndzController.connect(accounts[1]).updateParaSwapFee(newParaSwapFee)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });
});
