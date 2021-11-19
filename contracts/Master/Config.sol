// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract Config is AccessControl, Initializable, UUPSUpgradeable {
    // Enums
    enum CurrencyType {
        USDT,
        USDC,
        DAI,
        END_ENUM
    }

    // State Variable
    address public infiTokenAddr;
    mapping(CurrencyType => uint8) public currencyDecimals;
    mapping(CurrencyType => string) public currencyName;
    mapping(bytes2 => address payable) private contractAddresses; // list contract mapped by name
    mapping(address => bool) private contractsActive; // list internal smart contract address with status
    mapping(bytes2 => bool) private isUpgradable; // for mark internal smart contract that allowed to access function
    uint256 public maxDevaluation;
    uint256 public monitoringPeriod;
    uint256 public maxPayoutPeriod;
    uint256 public validationPreviousPeriod;

    function _authorizeUpgrade(address newImplementation) internal override {
        require(super._getAdmin() == msg.sender, "ERR_AUTH_5");
    }

    function initialize() public initializer {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // set stablecoins decimal
        currencyDecimals[CurrencyType.USDT] = 6;
        currencyDecimals[CurrencyType.USDC] = 6;
        currencyDecimals[CurrencyType.DAI] = 18;

        // set stablecoin coinId Name
        currencyName[CurrencyType.USDT] = "tether";
        currencyName[CurrencyType.USDC] = "usd-coin";
        currencyName[CurrencyType.DAI] = "dai";
        // set initial value
        maxDevaluation = 25; // in percentage
        monitoringPeriod = 72 hours;
        maxPayoutPeriod = 30 days;
        validationPreviousPeriod = 1 hours;
    }

    /**
     * @dev Mark a new contract as internal contract
     */
    function addNewInternalContract(
        bytes2 contractName,
        address payable contractAddress
    ) external {
        // Check Permission
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ERR_AUTH_1");

        isUpgradable[contractName] = true;
        contractsActive[contractAddress] = true;
        contractAddresses[contractName] = contractAddress;
    }

    /**
     * @dev Update internal contract address
     */
    function setLatestAddress(
        bytes2 contractName,
        address payable contractAddress
    ) external {
        // Check Permission
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ERR_AUTH_1");

        // Only for internal smart contract
        if (isUpgradable[contractName]) {
            contractsActive[contractAddresses[contractName]] = false;
            contractsActive[contractAddress] = true;
        }
        contractAddresses[contractName] = contractAddress;
    }

    /**
     * @dev get smart contract address based on initial contract name
     */
    function getLatestAddress(bytes2 contractName)
        external
        view
        returns (address payable)
    {
        return contractAddresses[contractName];
    }

    /**
     * @dev get decimals of given currency code/number
     */
    function getCurrencyDecimal(uint8 currencyType)
        external
        view
        returns (uint8)
    {
        return currencyDecimals[CurrencyType(currencyType)];
    }

    /**
     * @dev get name of given currency code/number
     */
    function getCurrencyName(uint8 currencyType)
        external
        view
        returns (string memory)
    {
        return currencyName[CurrencyType(currencyType)];
    }

    /**
     * @dev checks whether the address is an internal contract address.
     */
    function isInternal(address contractAddress) external view returns (bool) {
        return contractsActive[contractAddress];
    }

    /**
     * @dev Update variable that stored infi token address
     */
    function setInfiTokenAddr(address newAddr) external {
        require(newAddr != address(0), "Zero address not allowed");
        infiTokenAddr = newAddr;
        // Check Permission
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ERR_AUTH_1");
    }

    function setMaxDevaluation(uint256 newValue) external {
        maxDevaluation = newValue;
        // Check Permission
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ERR_AUTH_1");
    }

    function setMonitoringPeriod(uint256 newValue) external {
        monitoringPeriod = newValue;
        // Check Permission
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ERR_AUTH_1");
    }

    function setMaxPayoutPeriod(uint256 newValue) external {
        maxPayoutPeriod = newValue;
        // Check Permission
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ERR_AUTH_1");
    }

    function setValidationPreviousPeriod(uint256 newValue) external {
        validationPreviousPeriod = newValue;
        // Check Permission
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ERR_AUTH_1");
    }
}
