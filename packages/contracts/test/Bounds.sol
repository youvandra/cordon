// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/*
 * A lifetime cap high enough that it cannot be the reason a test fails.
 *
 * Every mandate now carries a lifetime cap, so the tests that existed before
 * it had to name one. They name this. Their subject is the window, the tranche
 * or the shape of the tree, and a cap that bit halfway through one of them
 * would make it fail for a reason it was never asking about.
 *
 * The lifetime cap has its own tests. This constant is how the others say they
 * are not the ones testing it.
 */
uint128 constant NO_LIFETIME_BOUND = type(uint128).max;
