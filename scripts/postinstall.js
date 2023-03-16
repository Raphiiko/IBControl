import reflect from "@alumna/reflect";

await reflect({
  src: "node_modules/swagger-ui-dist/",
  dest: "swagger/",
  recursive: true,
  delete: false,
  exclude: ["swagger-initializer.js", ".gitignore"],
});
