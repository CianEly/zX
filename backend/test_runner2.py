import asyncio
from zx.runner import ExecutionRunner

async def main():
    runner = ExecutionRunner("/Users/cianely/zX/cameltest", "params.csv")
    await runner.run_rows([])
    
if __name__ == "__main__":
    asyncio.run(main())
