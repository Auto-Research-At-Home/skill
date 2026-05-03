"""Encode/decode aggregate scores using ARAH_METRIC_SCALE (same rules as submit_proposal)."""

from __future__ import annotations


def decimal_metric_to_scaled_int(metric_text: str, scale: int) -> int:
    scale_b = int(scale)
    if scale_b <= 0:
        raise ValueError("metric scale must be positive")
    s = metric_text.strip()
    negative = s.startswith("-")
    if negative:
        s = s[1:]
    if "." in s:
        whole, frac = s.split(".", 1)
        if not whole:
            whole = "0"
        den = 10 ** len(frac)
        num = int(whole) * den + int(frac or "0")
        num *= scale_b
        if num % den != 0:
            raise ValueError("metric cannot be represented exactly at this scale")
        v = num // den
    else:
        v = int(s) * scale_b
    return -v if negative else v
