import unittest

from bonding_curve import cost_between


class TestCostBetween(unittest.TestCase):
    def test_demo_params_one_token(self):
        # Demo project params: basePrice=1e15 wei, slope=1e12 wei, supply=0.
        # cost = 1e15*1 + 1e12*1*(0+1)/2 = 1_000_500_000_000_000 wei.
        self.assertEqual(
            cost_between(10**15, 10**12, 0, 1),
            1_000_500_000_000_000,
        )

    def test_zero_amount(self):
        self.assertEqual(cost_between(10**15, 10**12, 42, 42), 0)

    def test_quadratic_in_amount(self):
        # Doubling tokens-bought ~quadruples slope term when supply==0.
        one = cost_between(0, 10**12, 0, 1_000)
        two = cost_between(0, 10**12, 0, 2_000)
        self.assertEqual(two, 4 * one)


if __name__ == "__main__":
    unittest.main()
