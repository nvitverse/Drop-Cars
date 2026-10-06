"""The scheduler's sweep does blocking work; it must not run on the server's event loop (one 122 s sweep froze every request on 2026-10-06)."""
import asyncio
import threading
import time


def test_the_sweep_runs_in_a_worker_thread_and_the_loop_stays_free():
    from app import main

    main_thread = threading.get_ident()
    seen = {}

    async def fake_sweep():
        seen["thread"] = threading.get_ident()
        time.sleep(0.4)                  # blocking work, exactly like the real sweep
        return {"ok": True}

    async def scenario():
        ticks = []

        async def ticker():
            for _ in range(6):
                ticks.append(time.time())
                await asyncio.sleep(0.05)

        t = asyncio.create_task(ticker())
        result = await main._run_off_loop(fake_sweep)
        await t
        return result, ticks

    result, ticks = asyncio.run(scenario())
    assert result == {"ok": True}
    assert seen["thread"] != main_thread                      # it did not run on the loop's thread
    assert len(ticks) == 6 and ticks[-1] - ticks[0] < 0.6     # the loop kept ticking while the sweep blocked
