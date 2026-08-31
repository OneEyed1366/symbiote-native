module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath:
          'import com.symbiote.foregroundservice.SymbioteForegroundServicePackage;',
        packageInstance: 'new SymbioteForegroundServicePackage()',
      },
      ios: null,
    },
  },
};
