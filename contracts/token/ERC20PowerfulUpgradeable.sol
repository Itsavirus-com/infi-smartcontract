// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./ChildERC20PowerfulUpgradeable.sol";
import "./ERC20MintableUpgradeable.sol";
import "./RolesUpgradeable.sol";

/**
 * @title PowerfulERC20
 * @dev Implementation of the PowerfulERC20
 */
contract ERC20PowerfulUpgradeable is
    Initializable,
    ERC20MintableUpgradeable,
    ChildERC20PowerfulUpgradeable,
    RolesUpgradeable
{
    // solhint-disable-next-line func-name-mixedcase
    function __PowerfulERC20_init(
        string memory name,
        string memory symbol,
        uint256 cap_,
        uint256 initialBalance_
    ) internal initializer {
        __Context_init_unchained();
        __ERC20Capped_init_unchained(cap_);
        __ERC20Burnable_init_unchained();
        __ERC20Burnable_init_unchained();
        __ERC20_init_unchained(name, symbol);
        __ERC165_init_unchained();
        __ERC1363_init_unchained();
        __AccessControl_init_unchained();
        __SafeTokenRecover_init_unchained();
        __PowerfulChildERC20_init_unchained(initialBalance_);

        // __Context_init_unchained();
        // __ERC20_init_unchained(name, symbol);
        __ERC20Mintable_init_unchained();

        // __Context_init_unchained();
        // __ERC165_init_unchained();
        // __AccessControl_init_unchained();
        __Roles_init_unchained();

        __PowerfulERC20_init_unchained();
    }

    // solhint-disable-next-line func-name-mixedcase, no-empty-blocks
    function __PowerfulERC20_init_unchained() internal initializer {}

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ChildERC20PowerfulUpgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        // ChildERC20PowerfulUpgradeable.supportsInterface() already contains AccessControlUpgradeable.supportsInterface()
        return ChildERC20PowerfulUpgradeable.supportsInterface(interfaceId);
    }

    /**
     * @dev Function to mint tokens.
     *
     * NOTE: restricting access to addresses with MINTER role. See {ERC20Mintable-mint}.
     *
     * @param account The address that will receive the minted tokens
     * @param amount The amount of tokens to mint
     */
    function _mint(address account, uint256 amount)
        internal
        virtual
        override(ChildERC20PowerfulUpgradeable, ERC20Upgradeable)
        onlyRole(MINTER_ROLE)
    {
        ChildERC20PowerfulUpgradeable._mint(account, amount);
    }

    /**
     * @dev Function to stop minting new tokens.
     *
     * NOTE: restricting access to owner only. See {ERC20Mintable-finishMinting}.
     */
    function _finishMinting()
        internal
        virtual
        override
        onlyRole(getRoleAdmin(MINTER_ROLE))
    {
        super._finishMinting();
    }

    uint256[50] private __gap;
}
