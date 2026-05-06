"""Off-chain mirror of ProjectToken's quadratic bonding curve.

ProjectToken has decimals() == 0 — `a` is a raw whole-token count, never a
1e18-scaled fixed-point amount. Cost of buying `to - from` tokens at current
supply `from`:

    cost = basePrice*a + slope*a*(2*from + a)/2

Used to sanity-check msg.value before submitting buy() and to keep a unit
test pinning the formula.
"""

from __future__ import annotations


def cost_between(base_price: int, slope: int, from_supply: int, to_supply: int) -> int:
    if from_supply < 0 or to_supply < from_supply:
        raise ValueError("require 0 <= from_supply <= to_supply")
    a = to_supply - from_supply
    if a == 0:
        return 0
    # Mirrors ProjectToken.costBetween: integer math, no rounding.
    return base_price * a + slope * a * (2 * from_supply + a) // 2
