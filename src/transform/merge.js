function merge(datas) {
    if(Array.isArray(datas[0]))
        return datas.flat();

    return Object.assign({}, ...datas);
}

export { merge };