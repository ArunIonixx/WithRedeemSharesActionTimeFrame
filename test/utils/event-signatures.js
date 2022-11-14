const newFundCreatedABI =
  'event NewFundCreated(address indexed creator, address comptrollerProxy, address vaultProxy, address indexed fundOwner, string fundName, address indexed denominationAsset, uint256 sharesActionTimelock, bytes feeManagerConfigData, bytes policyManagerConfigData)';

module.exports = {
  newFundCreatedABI,
};
