// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Faucet is Ownable {
    using SafeERC20 for ERC20;

    address public infiTokenAddr;
    address public daiTokenAddr;
    address public usdtTokenAddr;
    address public usdcTokenAddr;

    event FaucetTransfer(
        address to,
        uint256 infiToken,
        uint256 daiToken,
        uint256 usdtToken,
        uint256 usdcToken
    );

    constructor(
        address _infiTokenAddr,
        address _daiTokenAddr,
        address _usdtTokenAddr,
        address _usdcTokenAddr
    ) {
        infiTokenAddr = _infiTokenAddr;
        daiTokenAddr = _daiTokenAddr;
        usdtTokenAddr = _usdtTokenAddr;
        usdcTokenAddr = _usdcTokenAddr;
    }

    function transferAll(address _to, uint256 _value) external onlyOwner {
        require(_value <= 20_000, "Exceed maximal transfer");
        _transfer(_to, _value, _value, _value, _value);
    }

    function transferSeparated(
        address _to,
        uint256 _infiToken,
        uint256 _daiToken,
        uint256 _usdtToken,
        uint256 _usdcToken
    ) external onlyOwner {
        require(_infiToken <= 20_000, "INFI exceed maximal transfer");
        require(_daiToken <= 20_000, "DAI exceed maximal transfer");
        require(_usdtToken <= 20_000, "USDT exceed maximal transfer");
        require(_usdcToken <= 20_000, "USDC exceed maximal transfer");
        _transfer(_to, _infiToken, _daiToken, _usdtToken, _usdcToken);
    }

    function _transfer(
        address _to,
        uint256 _infiToken,
        uint256 _daiToken,
        uint256 _usdtToken,
        uint256 _usdcToken
    ) private {
        IERC20(infiTokenAddr).transfer(_to, (_infiToken * 10**18));
        IERC20(daiTokenAddr).transfer(_to, (_daiToken * 10**18));
        ERC20(usdtTokenAddr).safeTransfer(_to, (_usdtToken * 10**6));
        IERC20(usdcTokenAddr).transfer(_to, (_usdcToken * 10**6));
        emit FaucetTransfer(_to, _infiToken, _daiToken, _usdtToken, _usdcToken);
    }
}
