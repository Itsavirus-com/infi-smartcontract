// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "./ERC1363Upgradeable.sol";
import "./SafeTokenRecoverUpgradeable.sol";

// import "./ServicePayer.sol";

/**
 * @title PowerfulERC20
 * @dev Implementation of the PowerfulERC20
 */
contract ChildERC20PowerfulUpgradeable is
    Initializable,
    ERC20CappedUpgradeable,
    ERC20BurnableUpgradeable,
    ERC1363Upgradeable,
    SafeTokenRecoverUpgradeable
{
    // solhint-disable-next-line func-name-mixedcase
    function __PowerfulChildERC20_init(
        string memory name,
        string memory symbol,
        uint256 cap_,
        uint256 initialBalance_
    ) internal initializer {
        __Context_init_unchained();
        __ERC20Capped_init_unchained(cap_);

        // __Context_init_unchained();
        __ERC20Burnable_init_unchained();

        __ERC20_init_unchained(name, symbol);
        __ERC165_init_unchained();
        __ERC1363_init_unchained();

        // __Context_init_unchained();
        // __ERC165_init_unchained();
        __AccessControl_init_unchained();
        __SafeTokenRecover_init_unchained();

        __PowerfulChildERC20_init_unchained(initialBalance_);
    }

    // solhint-disable-next-line func-name-mixedcase, no-empty-blocks
    function __PowerfulChildERC20_init_unchained(uint256 initialBalance_)
        internal
        initializer
    {
        if (initialBalance_ != 0) _mint(_msgSender(), initialBalance_);
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1363Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return
            ERC1363Upgradeable.supportsInterface(interfaceId) ||
            AccessControlUpgradeable.supportsInterface(interfaceId);
    }

    /**
     * @dev Function to mint tokens.
     *
     * @param account The address that will receive the minted tokens
     * @param amount The amount of tokens to mint
     */
    function _mint(address account, uint256 amount)
        internal
        virtual
        override(ERC20CappedUpgradeable, ERC20Upgradeable)
    {
        ERC20CappedUpgradeable._mint(account, amount);
    }

    uint256[50] private __gap;
}
