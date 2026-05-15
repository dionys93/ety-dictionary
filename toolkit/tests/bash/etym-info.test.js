it('finds the correct primary definition for "animate"', () => {
    const cmd = `bash -c "source ${SCRIPT_PATH} && etym-info animate"`;
    const output = execSync(cmd, { stdio: 'pipe' }).toString();
    
    expect(output).toContain('animait');
    expect(output).toContain('transitive verb');
});
