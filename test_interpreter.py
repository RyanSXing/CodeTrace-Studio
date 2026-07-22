import concurrent.futures
import unittest

from server import app, run_interpreter


class InterpreterTests(unittest.TestCase):
    def test_short_circuit_boolean_operators(self):
        and_result = run_interpreter("{ print(False andalso missing); }", "E")
        or_result = run_interpreter("{ print(True orelse missing); }", "E")

        self.assertEqual(and_result, {"output": "False\n", "error": None})
        self.assertEqual(or_result, {"output": "True\n", "error": None})

    def test_semantic_errors_keep_their_message(self):
        result = run_interpreter("{\n  print(1 / 0);\n}", "E")

        self.assertEqual(result["output"], "")
        self.assertIn("Division by zero", result["error"])
        self.assertIn("line 2, column 3", result["error"])

    def test_syntax_errors_include_a_location(self):
        result = run_interpreter("{\n  print(1)\n}", "E")

        self.assertEqual(result["output"], "")
        self.assertRegex(result["error"], r"Syntax error at line 3, column 1")

    def test_evaluation_budget_stops_runaway_loops(self):
        result = run_interpreter(
            "{ i = 0; while (i < 20000) { i = i + 1; } print(i); }",
            "E",
        )

        self.assertEqual(result["output"], "")
        self.assertIn("Execution limit exceeded", result["error"])

    def test_language_feature_smoke_cases(self):
        cases = [
            ("{ print(2 + 3 * 4); }", "14\n"),
            ("{ xs = [1, 2]; xs[0] = 9; print(xs); }", "[9, 2]\n"),
            ("{ print(#2(10, 20, 30)); }", "20\n"),
            ("{ print(\"hi\" + \"!\"); }", "hi!\n"),
            ("{ if (True) { print(1); } else { print(0); } }", "1\n"),
            (
                "fun square(x) = { output = x * x; } output; { print(square(5)); }",
                "25\n",
            ),
        ]

        for source, expected in cases:
            with self.subTest(source=source):
                self.assertEqual(
                    run_interpreter(source, "E"),
                    {"output": expected, "error": None},
                )

    def test_run_endpoint_isolates_concurrent_requests(self):
        source = """fun fib(n) = {
  if (n <= 1) { output = n; }
  else { output = fib(n - 1) + fib(n - 2); }
}
output;
{ print(fib(16)); }"""

        def post(mode):
            with app.test_client() as client:
                return client.post("/run", json={"code": source, "mode": mode})

        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            jobs = [(pool.submit(post, mode), mode) for _ in range(24) for mode in ("E", "P")]
            results = [(future.result(), mode) for future, mode in jobs]

        evaluations = [response for response, mode in results if mode == "E"]
        self.assertTrue(all(response.status_code == 200 for response in evaluations))
        self.assertTrue(all(response.get_json()["output"] == "987\n" for response in evaluations))

    def test_program_errors_use_unprocessable_entity_status(self):
        with app.test_client() as client:
            response = client.post("/run", json={"code": "{ print(nope); }", "mode": "E"})

        self.assertEqual(response.status_code, 422)
        self.assertIn("Undefined variable", response.get_json()["error"])

    def test_visualization_endpoints_reject_invalid_programs(self):
        with app.test_client() as client:
            responses = [
                client.post(endpoint, json={"code": "{ print(1) }"})
                for endpoint in ("/playback", "/trace")
            ]

        self.assertTrue(all(response.status_code == 422 for response in responses))
        self.assertTrue(all("line 1" in response.get_json()["error"] for response in responses))


if __name__ == "__main__":
    unittest.main()
