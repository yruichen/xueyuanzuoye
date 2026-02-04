from stu_homework import app


def main():
    with app.test_client() as client:
        resp = client.get("/api/list")
        print("/api/list", resp.status_code)
        if resp.is_json:
            data = resp.get_json()
            print("rows:", len(data))
        else:
            print("non-json response")


if __name__ == "__main__":
    main()
