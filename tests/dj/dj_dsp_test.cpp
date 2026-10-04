#include "DspProcessor.h"
#include <cassert>
#include <cmath>
#include <iostream>
#include <limits>
#include <vector>
using lastwave::audio::DspProcessor;
std::vector<float> tone(int channels, float amplitude, double freq=440) {
    std::vector<float> x(48000*channels);
    for(int n=0;n<48000;n++) for(int c=0;c<channels;c++) x[n*channels+c]=amplitude*std::sin(n*freq*2*3.141592653589793/48000);
    return x;
}
double rms(const std::vector<float>& x) { double sum=0; for(size_t n=x.size()/2;n<x.size();n++)sum+=x[n]*x[n];return std::sqrt(sum/(x.size()/2)); }
int main() {
    int tests=0;
    for(int channels: {1,2}) {
        DspProcessor dsp; dsp.configure(48000); auto input=tone(channels,.1);auto x=input;
        dsp.process(x.data(),48000,channels); assert(x==input);tests++;
        dsp.setDjCue(.7,0,0,0); x=input;dsp.process(x.data(),48000,channels);
        assert(std::abs(rms(x)/rms(input)-.7)<.002);tests++;
        dsp.setDjCue(.9,0,0,0);x=input;dsp.process(x.data(),48000,channels);
        assert(std::abs(rms(x)/rms(input)-.9)<.002);tests++;
        dsp.setDjCue(1,6,6,6);x=tone(channels,4,90);dsp.process(x.data(),48000,channels);
        for(float y:x) { assert(std::isfinite(y)&&std::abs(y)<=1); } tests++;
        dsp.setBitPerfect(true);x=input;dsp.process(x.data(),48000,channels);assert(x==input);tests++;
        dsp.setBitPerfect(false);dsp.setDjCue(1,0,0,0);
        for(int k=0;k<3;k++){x=input;dsp.process(x.data(),48000,channels);}
        x=input;dsp.process(x.data(),48000,channels);assert(x==input);tests++;
        dsp.setDjCue(std::numeric_limits<float>::quiet_NaN(),INFINITY,-INFINITY,INFINITY);
        x=input;dsp.process(x.data(),48000,channels);assert(x==input);tests++;
        for(auto pair: {std::pair<double,bool>(90,false),{2200,true}}) {
            auto dry=tone(channels,.01,pair.first);x=dry;
            dsp.setDjCue(1,0,pair.second?3:0,pair.second?0:3);dsp.process(x.data(),48000,channels);
            assert(rms(x)/rms(dry)>1.35);tests++;
        }
    }
    std::cout<<tests<<" DSP checks passed\n";
}
