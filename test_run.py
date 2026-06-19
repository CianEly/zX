import sys
sys.path.insert(0, '/Users/cianely/zX/backend')

import asyncio
from zx.runner import run_exploration

async def main():
    await run_exploration('/Users/cianely/zX/cameltest/data/params.csv')

asyncio.run(main())
