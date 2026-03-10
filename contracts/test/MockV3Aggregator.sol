// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockV3Aggregator
 * @dev Mock price feed for testing
 */
contract MockV3Aggregator {
    int256 public price;
    uint8 public decimals;
    uint256 public version;

    constructor(uint8 _decimals, int256 _price) {
        decimals = _decimals;
        price = _price;
        version = 1;
    }

    function latestRoundData() public view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, price, block.timestamp, block.timestamp, 1);
    }
}
