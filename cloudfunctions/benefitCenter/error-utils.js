function errorText(error) {
  return [
    error && error.errCode,
    error && error.code,
    error && error.message,
    error && error.errMsg
  ].filter(Boolean).join(' ');
}

function isCollectionMissing(error) {
  return /DATABASE_COLLECTION_NOT_EXIST|COLLECTION_NOT_EXIST|collection not exists|Db or Table not exist|ResourceNotFound/i
    .test(errorText(error));
}

function isDocumentMissing(error) {
  const text = errorText(error);
  return /DATABASE_DOCUMENT_NOT_EXIST|DOCUMENT_NOT_EXIST|document not exists|document\b.*\bdoes not exist|doc not exist|not found/i
    .test(text);
}

module.exports = {
  errorText,
  isCollectionMissing,
  isDocumentMissing
};
