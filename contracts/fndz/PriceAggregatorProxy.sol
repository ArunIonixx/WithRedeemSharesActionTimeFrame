// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

import "../release/interfaces/IChainlinkAggregator.sol";
import "./interfaces/IPriceAggregator.sol";

/// @title PriceAggregatorProxy contract
/// @notice Proxy for the ChainlinkPriceAggregator.
/// Each token will have their seperate aggregator proxies
contract PriceAggregatorProxy is IChainlinkAggregator {
    // State variables
    IPriceAggregator public aggregator;
    address public token;
    string public description;
    uint8 public decimals;

    /// @notice Constucts the contract
    /// @param _aggregator - Contract address of the ChainLinkPriceAggregator
    /// @param _token - address of the token
    /// @param _description - describes this proxy (Eg, "DAI / USD")
    /// @param _decimals - decimals of the Price
    constructor(
        address _aggregator,
        address _token,
        string memory _description,
        uint8 _decimals
    ) public {
        aggregator = IPriceAggregator(_aggregator);
        token = _token;
        description = _description;
        decimals = _decimals;
    }

    /// @notice - Returns the Latest Price of the Token
    function latestAnswer() external view override returns (int256 _price) {
        return aggregator.getPrice(token);
    }

    /// @notice - Returns the timestamp of the Price when requested
    function latestTimestamp() external view override returns (uint256 _timestamp) {
        return aggregator.latestTimestamp();
    }
}
