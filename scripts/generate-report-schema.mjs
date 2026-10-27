import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildJsonReportJsonSchema } from "../dist/src/schemas/report.js";

const target = fileURLToPath(new URL("../schema/harnix-report.schema.json", import.meta.url));
const schema = buildJsonReportJsonSchema();

await writeFile(target, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
console.log(`Wrote ${target}`);
