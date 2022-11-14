// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

import "../release/interfaces/IUniswapV2Pair.sol";

/// @title MockUniswapV2Pair Contract
/// @notice Mocked the functionalities of UniswapV2Pair for testing
contract MockUniswapV2Pair is IUniswapV2Pair {
    address private base;
    address private quote;
    uint112 private baseReserves;
    uint112 private quoteReserves;
    uint32 private rate;

    constructor(
        address _token0,
        address _token1,
        uint112 _baseReserves,
        uint112 _quoteReserves,
        uint32 _rate
    ) public {
        base = _token0;
        quote = _token1;
        baseReserves = _baseReserves;
        quoteReserves = _quoteReserves;
        rate = _rate;
    }

    /// @notice returns the 0th token of the pair
    function token0() external view override returns (address) {
        return base;
    }

    /// @notice returns the 1st token of the pair
    function token1() external view override returns (address) {
        return quote;
    }

    /// @notice returns the reserves of the token pairs in the pool
    function getReserves()
        external
        view
        override
        returns (
            uint112,
            uint112,
            uint32
        )
    {
        return (baseReserves, quoteReserves, rate);
    }

    function kLast() external view override returns (uint256) {
        return 0;
    }

    function totalSupply() external view override returns (uint256) {
        return 0;
    }
}
