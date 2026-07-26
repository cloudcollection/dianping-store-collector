import argparse

from .config import APP_VERSION, DATA_DIR, MONGO_DATABASE
from .security import API_TOKEN


def main() -> None:
    parser = argparse.ArgumentParser(description="店迹本地服务工具")
    parser.add_argument("command", choices=("token", "info"))
    args = parser.parse_args()

    if args.command == "token":
        print(API_TOKEN)
        return

    print(f"店迹本地服务 v{APP_VERSION}")
    print(f"数据目录: {DATA_DIR}")
    print(f"MongoDB: {MONGO_DATABASE}")


if __name__ == "__main__":
    main()
