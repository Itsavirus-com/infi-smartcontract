// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";

contract SelfFaucet is Ownable, Pausable {
    using SafeERC20 for ERC20;

    bool public isPause = false;

    address public infiTokenAddr;
    address public daiTokenAddr;
    address public usdtTokenAddr;
    address public usdcTokenAddr;

    mapping(address => uint256) private addressToClaimTime;
    uint256 public infiAmount;
    uint256 public daiAmount;
    uint256 public usdtAmount;
    uint256 public usdcAmount;
    uint256 public daysBuffer;

    event FaucetTransfer(
        address to,
        uint256 infiAmount,
        uint256 daiAmount,
        uint256 usdtAmount,
        uint256 usdcAmount
    );

    modifier canCallFaucet(address _to) {
        require(checkAddressBuffer(_to), "ERR_FC_1");
        _;
    }

    constructor(
        address _infiTokenAddr,
        address _daiTokenAddr,
        address _usdtTokenAddr,
        address _usdcTokenAddr,
        uint256 _daysBuffer,
        uint256 _infiAmount,
        uint256 _daiAmount,
        uint256 _usdtAmount,
        uint256 _usdcAmount
    ) {
        infiTokenAddr = _infiTokenAddr;
        daiTokenAddr = _daiTokenAddr;
        usdtTokenAddr = _usdtTokenAddr;
        usdcTokenAddr = _usdcTokenAddr;
        daysBuffer = _daysBuffer;
        infiAmount = _infiAmount;
        daiAmount = _daiAmount;
        usdtAmount = _usdtAmount;
        usdcAmount = _usdcAmount;
    }

    function pause() external onlyOwner {
        isPause = true;
        _pause();
    }

    function unpause() external onlyOwner {
        isPause = false;
        _unpause();
    }

    function setInfiTransferAmount(uint256 _amount) external onlyOwner {
        infiAmount = _amount;
    }

    function setDaiTransferAmount(uint256 _amount) external onlyOwner {
        daiAmount = _amount;
    }

    function setUsdtTransferAmount(uint256 _amount) external onlyOwner {
        usdtAmount = _amount;
    }

    function setUsdcTransferAmount(uint256 _amount) external onlyOwner {
        usdcAmount = _amount;
    }

    function setDaysBuffer(uint256 _days) external onlyOwner {
        daysBuffer = _days;
    }

    function claimToken(address _to) external whenNotPaused canCallFaucet(_to) {
        addressToClaimTime[_to] = block.timestamp;
        IERC20(infiTokenAddr).transfer(_to, (infiAmount * 10**18));
        IERC20(daiTokenAddr).transfer(_to, (daiAmount * 10**18));
        ERC20(usdtTokenAddr).safeTransfer(_to, (usdtAmount * 10**6));
        IERC20(usdcTokenAddr).transfer(_to, (usdcAmount * 10**6));
        emit FaucetTransfer(_to, infiAmount, daiAmount, usdtAmount, usdcAmount);
    }

    function checkAddressBuffer(address _address) public view returns (bool) {
        return
            (addressToClaimTime[_address] + (daysBuffer * 1 days)) <=
            block.timestamp;
    }

    function nextClaimTime(address _address) external view returns (uint256) {
        return addressToClaimTime[_address] + (daysBuffer * 1 days);
    }

    function transferInfi(address _to, uint256 _amount) external onlyOwner {
        IERC20(infiTokenAddr).transfer(_to, (_amount * 10**18));
    }
}
