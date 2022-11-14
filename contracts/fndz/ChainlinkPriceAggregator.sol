// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IPriceAggregator.sol";

/// @title ChainlinkPriceAggregator contract
/// @notice Aggregates the Token price feeds from the ChainLink node
contract ChainlinkPriceAggregator is IPriceAggregator, OwnableUpgradeable {
    // State Variables
    address public oracle;
    uint256 public override latestTimestamp;
    mapping(address => int256) private tokenPrice;

    // Events
    event OracleUpdated(address _old, address _new);
    event PriceFeedUpdated(address[] tokens, int256[] prices, uint256 requestedAt);

    // Modifiers
    modifier onlyAccessor() {
        require(msg.sender == oracle, "Only accessor");
        _;
    }

    /// @notice Initializes the upgradable ChainLinkPriceAggregator
    /// @param _oracle - Address of the ChainLink Node's oracle contract
    function initialize(address _oracle) public initializer {
        __Ownable_init();
        oracle = _oracle;
    }

    /// @notice Updates the prices of the Each tokens with the timestamp
    /// @param _tokens - Addresses of the Tokens
    /// @param _prices - Prices of the Each tokens wrt the index
    /// @param _timestamp - Off-chain data requested timestamp
    function updatePriceFeed(
        address[] memory _tokens,
        int256[] memory _prices,
        uint256 _timestamp
    ) public onlyAccessor {
        require(_tokens.length == _prices.length, "Unequal _tokens and _prices array length");
        require(
            latestTimestamp <= _timestamp && _timestamp <= block.timestamp,
            "Invalid timestamp"
        );

        for (uint32 i = 0; i < _tokens.length; i++) {
            require(_tokens[i] != address(0), "_tokens contain the zero address");
            require(_prices[i] > 0, "_prices should be greater than 0");
            tokenPrice[_tokens[i]] = _prices[i];
        }

        latestTimestamp = _timestamp;
        emit PriceFeedUpdated(_tokens, _prices, _timestamp);
    }

    /// @notice updates the Oracle address of the ChainLink Node
    /// @param _oracle - Oracle contract address
    function updateOracle(address _oracle) public onlyOwner {
        address old = oracle;
        oracle = _oracle;
        emit OracleUpdated(old, _oracle);
    }

    /// @notice Returns the Price of the Token
    /// @param _token - Address of the Token
    function getPrice(address _token) public view override returns (int256 _price) {
        return tokenPrice[_token];
    }
}
