# xcratch-share-presign (AWS Lambda)

Issues a presigned S3 POST so the editor can upload a `.sb3` straight to the
`xcratch-share-699jp` bucket (see `packages/scratch-gui/src/lib/xcratch-st-share.js`).

- Runtime: nodejs22.x, handler `index.handler`, region ap-northeast-1
- Env: `BUCKET=xcratch-share-699jp`, `SHARE_HOST=https://share.699.jp`,
  `ALLOWED_ORIGINS=https://xcratch-st.699.jp,http://127.0.0.1:8000,http://localhost:8601,http://localhost:8000`
- Function URL (auth NONE, CORS: POST from the origins above)

Deploy an update:

```sh
cd scripts/share-lambda
npm install --omit=dev
zip -qr ../function.zip .
aws lambda update-function-code --function-name xcratch-share-presign --zip-file fileb://../function.zip
```
