// SPDX-License-Identifier: MIT

// ERC-20 spec
pragma solidity 0.6.12;

// Similar IWETH9 which is IERC20Detailed + withdraw/deposit
import {IERC20Detailed} from "@aave/protocol-v2/contracts/dependencies/openzeppelin/contracts/IERC20Detailed.sol";

interface IWeth is IERC20Detailed {
    function deposit() external payable;

    function withdraw(uint256 wad) external;
}
